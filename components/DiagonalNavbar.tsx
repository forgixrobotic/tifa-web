"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";

interface DiagonalNavbarProps {
    theme?: 'diagonal' | 'tifa';
}

export default function DiagonalNavbar({ theme = 'diagonal' }: DiagonalNavbarProps) {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const rafRef = useRef<number>(0);
    const lastScrollY = useRef(0);

    const isTifa = theme === 'tifa';

    // Theme colors
    const colors = {
        diagonal: {
            primary: '#2FAEB7',
            dark: '#2C3A50',
            accent: '#20C5D0',
            gradient: 'from-[#2FAEB7] to-[#20C5D0]',
        },
        tifa: {
            primary: '#B6252A',
            dark: '#1F1F1F',
            accent: '#D32F2F',
            gradient: 'from-[#B6252A] to-[#D32F2F]',
        }
    };

    const currentColors = colors[theme];

    // Throttled scroll handler
    const handleScroll = useCallback(() => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }

        rafRef.current = requestAnimationFrame(() => {
            const currentScrollY = window.scrollY;
            if ((currentScrollY > 50) !== (lastScrollY.current > 50)) {
                setIsScrolled(currentScrollY > 50);
            }
            lastScrollY.current = currentScrollY;
        });
    }, []);

    useEffect(() => {
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", handleScroll);
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [handleScroll]);

    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: "smooth" });
        }
        setIsMobileMenuOpen(false);
    };

    // Navigation items - different for each theme
    const navItems = isTifa
        ? [
            { id: 'home', label: 'Home', href: '/tifa' },
            { id: 'about', label: 'About', href: '/tifa#about' },
            { id: 'services', label: 'Services', href: '/tifa#services' },
            { id: 'product', label: 'Product', href: '/tifa#product' },
            { id: 'contact', label: 'Contact', href: '/tifa#contact' },
        ]
        : [
            { id: 'home', label: 'Home', href: '/' },
            { id: 'services', label: 'Services', href: '/#services' },
            { id: 'products', label: 'Our Products', href: '/#products' },
            { id: 'about', label: 'About Us', href: '/#about' },
        ];

    return (
        <>
            <nav
                className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 gpu-accelerated ${isScrolled
                    ? isTifa
                        ? "bg-[#1F1F1F]/95 backdrop-blur-md shadow-lg py-3"
                        : "bg-white/95 backdrop-blur-md shadow-lg py-3"
                    : "bg-transparent py-5"
                    }`}
            >
                <div className="max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between">
                    {/* Logo */}
                    <Link href={isTifa ? "/tifa" : "/"} className="flex items-center gap-3 group">
                        {isTifa ? (
                            <Image
                                src="/logo/tifa/tifa_full.png"
                                alt="TIFA Logo"
                                width={194}
                                height={86}
                                className="h-20 w-auto object-contain group-hover:scale-105 transition-transform"
                                priority
                            />
                        ) : (
                            <Image
                                src="/logo/diagonal/diagonal_white.png"
                                alt="Diagonal Robotics"
                                width={180}
                                height={50}
                                className={`h-10 w-auto object-contain group-hover:scale-105 transition-transform ${isScrolled && !isTifa ? 'brightness-0' : ''}`}
                                priority
                            />
                        )}
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden lg:flex items-center gap-1">
                        {navItems.map((item) => (
                            <Link
                                key={item.id}
                                href={item.href}
                                onClick={(e) => {
                                    // Handle hash links for both Diagonal (/#) and TIFA (/tifa#) pages
                                    if (item.href.includes('#')) {
                                        e.preventDefault();
                                        scrollToSection(item.id);
                                    }
                                }}
                                className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-all ${isScrolled && !isTifa
                                    ? 'text-[#2C3A50] hover:bg-gray-100'
                                    : 'text-white/80 hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </div>

                    {/* Right Side Actions */}
                    <div className="flex items-center gap-3">
                        {/* Contact Button - WhatsApp (only for Diagonal theme) */}
                        {!isTifa && (
                            <a
                                href="https://wa.me/6281234567890?text=Halo%20Diagonal!"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hidden sm:flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all bg-gradient-to-r from-[#2FAEB7] to-[#20C5D0] text-white shadow-lg shadow-teal-900/30 hover:shadow-teal-900/50 hover:-translate-y-0.5"
                            >
                                Contact
                            </a>
                        )}

                        {/* Login / Get Started Button */}
                        <Link
                            href="/login"
                            className={`hidden md:block px-5 py-2.5 text-sm font-semibold rounded-lg transition-all hover:-translate-y-0.5 ${isTifa
                                ? 'bg-gradient-to-r from-[#B6252A] to-[#D32F2F] text-white shadow-lg shadow-red-900/30 hover:shadow-red-900/50'
                                : isScrolled
                                    ? 'bg-gradient-to-r from-[#2FAEB7] to-[#20C5D0] text-white shadow-lg shadow-teal-500/20 hover:shadow-teal-500/40'
                                    : 'bg-gradient-to-r from-[#2FAEB7] to-[#20C5D0] text-white shadow-lg shadow-teal-500/20 hover:shadow-teal-500/40'
                                }`}
                        >
                            {isTifa ? 'Get started' : 'Get Started'}
                        </Link>

                        {/* Mobile Menu Button */}
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className={`lg:hidden p-2 rounded-lg transition-colors ${isScrolled && !isTifa
                                ? 'text-[#2C3A50] hover:bg-gray-100'
                                : 'text-white hover:bg-white/10'
                                }`}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {isMobileMenuOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                )}
                            </svg>
                        </button>
                    </div>
                </div>
            </nav>

            {/* Mobile Menu */}
            <div
                className={`fixed inset-0 z-40 lg:hidden transition-all duration-300 ${isMobileMenuOpen ? 'visible' : 'invisible'
                    }`}
            >
                {/* Backdrop */}
                <div
                    className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'
                        }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                />

                {/* Menu Panel */}
                <div
                    className={`absolute top-0 right-0 h-full w-72 transition-transform duration-300 ${isTifa ? 'bg-[#1F1F1F]' : 'bg-white'
                        } ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
                >
                    <div className="p-6 pt-20">
                        <nav className="space-y-2">
                            {navItems.map((item) => (
                                <Link
                                    key={item.id}
                                    href={item.href}
                                    onClick={(e) => {
                                        // Handle hash links for both Diagonal (/#) and TIFA (/tifa#) pages
                                        if (item.href.includes('#')) {
                                            e.preventDefault();
                                            scrollToSection(item.id);
                                        }
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={`block px-4 py-3 text-base font-medium rounded-lg transition-colors ${isTifa
                                        ? 'text-white/80 hover:text-white hover:bg-white/10'
                                        : 'text-[#2C3A50] hover:bg-gray-100'
                                        }`}
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </nav>

                        <div className="mt-8 pt-8 border-t border-gray-200/20 space-y-3">
                            <Link
                                href="/login"
                                className={`block w-full px-4 py-3 text-center text-base font-semibold rounded-lg transition-all ${isTifa
                                    ? 'bg-gradient-to-r from-[#B6252A] to-[#D32F2F] text-white'
                                    : 'bg-gradient-to-r from-[#2FAEB7] to-[#20C5D0] text-white'
                                    }`}
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                {isTifa ? 'Get started' : 'Get Started'}
                            </Link>
                            {!isTifa && (
                                <a
                                    href="https://wa.me/6281234567890?text=Halo%20Diagonal!"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 w-full px-4 py-3 text-center text-base font-semibold rounded-lg border-2 transition-all border-[#2FAEB7] text-[#2FAEB7]"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                    </svg>
                                    WhatsApp
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
