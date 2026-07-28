'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parsePgm } from '@/lib/utils/pgmParser';
import { parseMapYaml, MapYamlMeta } from '@/lib/utils/yamlParser';
import type { Goal } from '@/lib/types/database';

interface RobotPose {
    device_id: number;
    device_code: string;
    device_name?: string | null;
    x: number;
    y: number;
    yaw: number;
}

interface Map3DViewerProps {
    mapId: number;
    imageUrl: string;
    yamlUrl?: string;
    goals?: Goal[];
    robotPoses?: RobotPose[];
    onClose?: () => void;
}

export default function Map3DViewer({
    mapId,
    imageUrl,
    yamlUrl,
    goals = [],
    robotPoses = [],
    onClose,
}: Map3DViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [wallHeight, setWallHeight] = useState<number>(1.5);
    const [wireframe, setWireframe] = useState<boolean>(false);
    const [stats, setStats] = useState({ wallCount: 0, resolution: 0.05, widthMeters: 0, heightMeters: 0 });

    // Store refs for objects that update dynamically without resetting WebGL
    const sceneRef = useRef<THREE.Scene | null>(null);
    const instancedMeshRef = useRef<THREE.InstancedMesh | null>(null);
    const wallMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
    const goalsGroupRef = useRef<THREE.Group | null>(null);
    const robotsGroupRef = useRef<THREE.Group | null>(null);
    const goalsRef = useRef<Goal[]>(goals);
    const robotPosesRef = useRef<RobotPose[]>(robotPoses);

    // Keep refs updated with current props
    useEffect(() => {
        goalsRef.current = goals;
    }, [goals]);

    useEffect(() => {
        robotPosesRef.current = robotPoses;
    }, [robotPoses]);

    // ------------------------------------------------------------------
    // 1. WebGL Initialization (Runs ONCE per imageUrl / yamlUrl)
    // ------------------------------------------------------------------
    useEffect(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;

        let isMounted = true;
        setLoading(true);
        setError(null);

        // Scene Setup
        const scene = new THREE.Scene();
        sceneRef.current = scene;
        scene.background = new THREE.Color(0x1a2332);
        scene.fog = new THREE.FogExp2(0x1a2332, 0.008);

        // Dynamic Group containers for Waypoints & Robots
        const goalsGroup = new THREE.Group();
        const robotsGroup = new THREE.Group();
        scene.add(goalsGroup);
        scene.add(robotsGroup);
        goalsGroupRef.current = goalsGroup;
        robotsGroupRef.current = robotsGroup;

        const width = container.clientWidth || 800;
        const height = container.clientHeight || 500;
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(0, -15, 12);
        camera.up.set(0, 0, 1); // ROS Z-UP

        let renderer: THREE.WebGLRenderer;
        let controls: OrbitControls;

        try {
            renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: true,
                alpha: true,
            });
            renderer.setSize(width, height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFShadowMap;

            controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.maxPolarAngle = Math.PI / 2 - 0.01;
        } catch (err: unknown) {
            if (isMounted) {
                setError(`WebGL initialization error: ${err instanceof Error ? err.message : 'WebGL not supported'}`);
                setLoading(false);
            }
            return;
        }

        // Lighting — brighter to avoid "too dark/abstract" appearance
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0x93c5fd, 1.8);
        dirLight.position.set(15, -25, 40);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        scene.add(dirLight);

        const dirLight2 = new THREE.DirectionalLight(0xfde68a, 0.6);
        dirLight2.position.set(-10, 15, 20);
        scene.add(dirLight2);

        const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.8);
        scene.add(hemiLight);

        // Load PGM & YAML Data
        const loadMap3D = async () => {
            try {
                const imgRes = await fetch(imageUrl);
                if (!imgRes.ok) throw new Error(`Failed to load map image (${imgRes.status})`);
                const buffer = await imgRes.arrayBuffer();

                let pgmWidth = 0;
                let pgmHeight = 0;
                let pixels: Uint8ClampedArray | null = null;

                try {
                    const parsed = parsePgm(buffer);
                    pgmWidth = parsed.width;
                    pgmHeight = parsed.height;
                    pixels = parsed.pixels;
                } catch {
                    const blob = new Blob([buffer]);
                    const blobUrl = URL.createObjectURL(blob);
                    const img = new Image();
                    await new Promise((res) => {
                        img.onload = res;
                        img.src = blobUrl;
                    });
                    pgmWidth = img.width;
                    pgmHeight = img.height;

                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = img.width;
                    tempCanvas.height = img.height;
                    const tCtx = tempCanvas.getContext('2d');
                    if (tCtx) {
                        tCtx.drawImage(img, 0, 0);
                        pixels = tCtx.getImageData(0, 0, img.width, img.height).data;
                    }
                }

                if (!pixels || pgmWidth === 0 || pgmHeight === 0) {
                    throw new Error('Failed to parse PGM image pixels');
                }

                let meta: MapYamlMeta = {
                    image: 'map.pgm',
                    resolution: 0.05,
                    origin: [0, 0, 0],
                    occupiedThresh: 0.65,
                    freeThresh: 0.25,
                    negate: 0,
                };

                if (yamlUrl) {
                    try {
                        const yamlRes = await fetch(yamlUrl);
                        if (yamlRes.ok) {
                            meta = parseMapYaml(await yamlRes.text());
                        }
                    } catch {
                        // Keep default
                    }
                }

                const res = meta.resolution;
                const mapRealWidth = pgmWidth * res;
                const mapRealHeight = pgmHeight * res;
                const originX = meta.origin[0];
                const originY = meta.origin[1];

                if (isMounted) {
                    setStats({
                        wallCount: 0,
                        resolution: res,
                        widthMeters: Number(mapRealWidth.toFixed(2)),
                        heightMeters: Number(mapRealHeight.toFixed(2)),
                    });
                }

                // 3D Floor Plane
                const floorGeo = new THREE.PlaneGeometry(mapRealWidth, mapRealHeight);
                const floorMat = new THREE.MeshStandardMaterial({
                    color: 0x1e293b,
                    roughness: 0.7,
                    metalness: 0.1,
                });
                const floorMesh = new THREE.Mesh(floorGeo, floorMat);
                floorMesh.position.set(originX + mapRealWidth / 2, originY + mapRealHeight / 2, -0.01);
                floorMesh.receiveShadow = true;
                scene.add(floorMesh);

                // Grid helper
                const gridHelper = new THREE.GridHelper(Math.max(mapRealWidth, mapRealHeight), 20, 0x3b82f6, 0x1e293b);
                gridHelper.rotation.x = Math.PI / 2;
                gridHelper.position.set(originX + mapRealWidth / 2, originY + mapRealHeight / 2, 0);
                scene.add(gridHelper);

                // 3D Extruded Walls using InstancedMesh
                const occupiedIndices: { px: number; py: number }[] = [];
                for (let py = 0; py < pgmHeight; py++) {
                    for (let px = 0; px < pgmWidth; px++) {
                        const idx = (py * pgmWidth + px) * 4;
                        const r = pixels[idx];
                        if (r < 100) {
                            occupiedIndices.push({ px, py });
                        }
                    }
                }

                const wallCount = occupiedIndices.length;
                if (isMounted) setStats((s) => ({ ...s, wallCount }));

                const boxGeo = new THREE.BoxGeometry(res, res, 1.0); // Unit height, scaled dynamically
                const boxMat = new THREE.MeshStandardMaterial({
                    color: 0x475569,
                    roughness: 0.3,
                    metalness: 0.5,
                    wireframe,
                });
                wallMaterialRef.current = boxMat;

                const instancedMesh = new THREE.InstancedMesh(boxGeo, boxMat, wallCount);
                instancedMesh.castShadow = true;
                instancedMesh.receiveShadow = true;
                instancedMeshRef.current = instancedMesh;

                const dummy = new THREE.Object3D();
                for (let i = 0; i < wallCount; i++) {
                    const { px, py } = occupiedIndices[i];
                    const wx = originX + px * res + res / 2;
                    const wy = originY + (pgmHeight - py) * res - res / 2;

                    dummy.position.set(wx, wy, 0.75); // Centered height
                    dummy.scale.set(1, 1, 1.5); // Initial wall height 1.5m
                    dummy.updateMatrix();
                    instancedMesh.setMatrixAt(i, dummy.matrix);
                }
                instancedMesh.instanceMatrix.needsUpdate = true;
                scene.add(instancedMesh);

                // Populate 3D Goals
                rebuildGoals3D(goalsGroup, goalsRef.current);

                // Populate 3D Robots
                rebuildRobots3D(robotsGroup, robotPosesRef.current);

                // Center camera on map
                const centerX = originX + mapRealWidth / 2;
                const centerY = originY + mapRealHeight / 2;
                controls.target.set(centerX, centerY, 0);
                camera.position.set(centerX, centerY - 18, 14);
                controls.update();

                if (isMounted) setLoading(false);
            } catch (err: unknown) {
                if (isMounted) {
                    setError(err instanceof Error ? err.message : 'Error rendering 3D map');
                    setLoading(false);
                }
            }
        };

        void loadMap3D();

        // Animation Loop
        let animationFrameId: number;
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        // Resize Listener
        const handleResize = () => {
            if (!container) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            isMounted = false;
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleResize);
            controls.dispose();
            renderer.dispose();
        };
        // ONLY depend on imageUrl & yamlUrl to avoid infinite re-render loop!
    }, [imageUrl, yamlUrl]);

    // ------------------------------------------------------------------
    // 2. Dynamic Props Updates (Wall Height & Wireframe without WebGL Reset)
    // ------------------------------------------------------------------
    useEffect(() => {
        if (wallMaterialRef.current) {
            wallMaterialRef.current.wireframe = wireframe;
        }
    }, [wireframe]);

    useEffect(() => {
        const instancedMesh = instancedMeshRef.current;
        if (!instancedMesh) return;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < instancedMesh.count; i++) {
            instancedMesh.getMatrixAt(i, dummy.matrix);
            dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
            dummy.scale.z = wallHeight;
            dummy.position.z = wallHeight / 2;
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
    }, [wallHeight]);

    useEffect(() => {
        if (goalsGroupRef.current) {
            rebuildGoals3D(goalsGroupRef.current, goals);
        }
    }, [goals]);

    useEffect(() => {
        if (robotsGroupRef.current) {
            rebuildRobots3D(robotsGroupRef.current, robotPoses);
        }
    }, [robotPoses]);

    return (
        <div className="flex flex-col h-full w-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden relative">
            {/* Header Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800 z-10">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-sky-400 "></span>
                        ROS 3D Map Visualizer
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">Map ID: {mapId}</span>
                </div>

                <div className="flex items-center gap-3">
                    {/* Wall Height Slider */}
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                        <span>Wall:</span>
                        <input
                            type="range"
                            min="0.2"
                            max="3.0"
                            step="0.1"
                            value={wallHeight}
                            onChange={(e) => setWallHeight(parseFloat(e.target.value))}
                            className="w-20 accent-sky-400 cursor-pointer"
                        />
                        <span className="font-mono text-sky-400 w-8">{wallHeight}m</span>
                    </div>

                    {/* Wireframe Toggle */}
                    <button
                        onClick={() => setWireframe(!wireframe)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                            wireframe ? 'bg-sky-500/20 text-sky-400 border-sky-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                    >
                        Wireframe
                    </button>

                    {onClose && (
                        <button onClick={onClose} className="text-xs px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg">
                            Close
                        </button>
                    )}
                </div>
            </div>

            {/* 3D WebGL Canvas Container */}
            <div ref={containerRef} className="flex-1 relative w-full min-h-[450px] bg-slate-950 cursor-grab active:cursor-grabbing">
                <canvas ref={canvasRef} className="w-full h-full block" />

                {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 z-20 gap-3">
                        <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm font-medium text-slate-300">Building ROS 3D Occupancy Grid Mesh (Three.js)...</p>
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-20 p-6 text-center">
                        <p className="text-sm font-semibold text-rose-400">{error}</p>
                    </div>
                )}
            </div>

            {/* Footer Stats Bar */}
            <div className="px-4 py-2 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
                <div className="flex gap-4">
                    <span>Dimension: <strong className="text-white">{stats.widthMeters}m × {stats.heightMeters}m</strong></span>
                    <span>Resolution: <strong className="text-sky-400">{stats.resolution}m/cell</strong></span>
                    <span>3D Mesh Blocks: <strong className="text-emerald-400">{stats.wallCount.toLocaleString()}</strong></span>
                </div>
                <div className="hidden sm:block text-slate-500">
                    Controls: Left-Drag (Rotate) | Right-Drag (Pan) | Scroll (Zoom)
                </div>
            </div>
        </div>
    );
}

// ------------------------------------------------------------------
// Helpers to build 3D Goals & Robots into Three.js Scene Groups
// ------------------------------------------------------------------
function rebuildGoals3D(group: THREE.Group, goals: Goal[]) {
    // Clear old children
    while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
    }

    goals.forEach((goal) => {
        if (goal.x === null || goal.y === null) return;

        const pinGroup = new THREE.Group();
        pinGroup.position.set(goal.x, goal.y, 0);

        const pinGeo = new THREE.CylinderGeometry(0.15, 0.05, 1.2, 16);
        const color = goal.goal_type === 'TABLE' ? 0x3b82f6 :
                      goal.goal_type === 'CHARGE' ? 0xeab308 :
                      goal.goal_type === 'HOME' ? 0x22c55e : 0xa855f7;

        const pinMat = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.5,
            roughness: 0.2,
        });
        const pinMesh = new THREE.Mesh(pinGeo, pinMat);
        pinMesh.rotation.x = Math.PI / 2;
        pinMesh.position.z = 0.6;
        pinGroup.add(pinMesh);

        const topGeo = new THREE.SphereGeometry(0.2, 16, 16);
        const topMesh = new THREE.Mesh(topGeo, pinMat);
        topMesh.position.z = 1.3;
        pinGroup.add(topMesh);

        group.add(pinGroup);
    });
}

function rebuildRobots3D(group: THREE.Group, robots: RobotPose[]) {
    while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
    }

    robots.forEach((robot) => {
        const robotGroup = new THREE.Group();
        robotGroup.position.set(robot.x, robot.y, 0.2);

        const bodyGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.4, 32);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xef4444,
            emissive: 0xef4444,
            emissiveIntensity: 0.4,
            metalness: 0.8,
        });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.rotation.x = Math.PI / 2;
        robotGroup.add(bodyMesh);

        const coneGeo = new THREE.ConeGeometry(0.2, 0.5, 16);
        const coneMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const coneMesh = new THREE.Mesh(coneGeo, coneMat);
        coneMesh.rotation.z = -Math.PI / 2;
        coneMesh.position.x = 0.4;
        coneMesh.rotation.x = Math.PI / 2;
        robotGroup.add(coneMesh);

        robotGroup.rotation.z = robot.yaw;
        group.add(robotGroup);
    });
}
