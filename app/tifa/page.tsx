'use client';

import { LanguageProvider, useLanguage } from "@/components/LanguageProvider";
import LandingLanguageSwitcher from "@/components/LandingLanguageSwitcher";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useCallback, useRef } from "react";

function TIFAContent() {
    const { tifaDict: dict } = useLanguage();
    const [isScrolled, setIsScrolled] = useState(false);
    const [isNavbarVisible, setIsNavbarVisible] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const rafRef = useRef<number>(0);
    const lastScrollY = useRef(0);

    const handleScroll = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            const currentScrollY = window.scrollY;
            
            setIsScrolled(currentScrollY > 50);

            if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
                // Scrolling down
                setIsNavbarVisible(false);
            } else if (currentScrollY < lastScrollY.current) {
                // Scrolling up
                setIsNavbarVisible(true);
            }
            
            lastScrollY.current = currentScrollY;
        });
    }, []);

    useEffect(() => {
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', handleScroll);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [handleScroll]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                } else if (entry.boundingClientRect.top > 0) {
                    // Only remove if it leaves through the bottom of the viewport
                    // Prevent infinite loop "jitter" at the top edge of the screen
                    entry.target.classList.remove('active');
                }
            }),
            { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
        );
        document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale, .reveal-slide-up').forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    const scrollToTop = (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
        setIsMobileMenuOpen(false);
    };

    const scrollToSection = (id: string) => {
        const el = document.getElementById(id);
        if (el) {
            const offset = 150;
            const top = el.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top, behavior: "smooth" });
        }
        setIsMobileMenuOpen(false);
    };

    const journeyItems = [
        { title: dict.journey.item_1.title, description: dict.journey.item_1.description, image: "/photos/prosestifa_1.png", align: "left" },
        { title: dict.journey.item_2.title, description: dict.journey.item_2.description, image: "/photos/prosestifa_2.png", align: "right" },
        { title: dict.journey.item_3.title, description: dict.journey.item_3.description, image: "/photos/tifa_in_telcoff.jpeg", align: "left" },
        { title: dict.journey.item_4.title, description: dict.journey.item_4.description, image: "/robot/tifa_head.png", align: "right" },
    ];

    return (
        <div className="min-h-screen bg-[#1F1F1F] text-white overflow-x-hidden font-[var(--font-jakarta)] tifa-theme">
            {/* NAVBAR - TIFA Theme */}
            <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? "bg-[#1F1F1F]/95 backdrop-blur-md shadow-lg py-2" : "bg-transparent py-4"} ${isNavbarVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"}`}>
                <div className="max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between">
                    <Link href="/tifa" onClick={scrollToTop} className="flex items-center group">
                        <Image src="/logo/tifa/tifa_full.png" alt="TIFA" width={100} height={45} className="h-[45px] w-auto object-contain" priority />
                    </Link>
                    <div className="hidden lg:flex items-center gap-1">
                        <Link href="/tifa" onClick={scrollToTop} className="px-4 py-2 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-all">{dict.nav.home}</Link>
                        <button onClick={() => scrollToSection('about')} className="px-4 py-2 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-all">{dict.nav.about}</button>
                        <button onClick={() => scrollToSection('services')} className="px-4 py-2 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-all">{dict.nav.services}</button>
                        <button onClick={() => scrollToSection('product')} className="px-4 py-2 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-all">{dict.nav.product}</button>
                        <button onClick={() => scrollToSection('contact')} className="px-4 py-2 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-all">{dict.nav.contact}</button>
                        <Link href="/tifa/docs" className="px-4 py-2 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-all">Docs</Link>
                    </div>
                    <div className="flex items-center gap-3">
                        <LandingLanguageSwitcher theme="tifa" isScrolled={isScrolled} />
                        <Link href="/login" className="hidden md:flex items-center px-5 py-2 text-sm font-semibold rounded-full bg-[#B6252A] text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40 hover:-translate-y-0.5 transition-all">{dict.nav.get_started}</Link>
                        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden p-2 rounded-lg text-white hover:bg-white/10 transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {isMobileMenuOpen ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
                            </svg>
                        </button>
                    </div>
                </div>
            </nav>

            {/* Mobile Menu */}
            <div className={`fixed inset-0 z-50 lg:hidden transition-all duration-300 ${isMobileMenuOpen ? 'visible' : 'invisible'}`}>
                <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setIsMobileMenuOpen(false)} />
                <div className={`absolute top-0 right-0 h-full w-72 bg-[#1F1F1F] transition-transform duration-300 flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                    {/* Mobile Menu Header */}
                    <div className="flex items-center justify-between p-6 border-b border-white/10">
                        <Image src="/logo/tifa/tifa.png" alt="TIFA" width={32} height={32} className="w-8 h-8 object-contain" />
                        <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 -mr-2 text-white/70 hover:text-white transition-colors rounded-lg hover:bg-white/10">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        <nav className="space-y-2">
                            <Link href="/tifa" className="block w-full text-left px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg" onClick={scrollToTop}>{dict.nav.home}</Link>
                            <button onClick={() => scrollToSection('about')} className="block w-full text-left px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg">{dict.nav.about}</button>
                            <button onClick={() => scrollToSection('services')} className="block w-full text-left px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg">{dict.nav.services}</button>
                            <button onClick={() => scrollToSection('product')} className="block w-full text-left px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg">{dict.nav.product}</button>
                            <a href="https://wa.me/6285179598393" className="block w-full text-left px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg">{dict.nav.contact}</a>
                            <Link href="/tifa/docs" className="block w-full text-left px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg" onClick={() => setIsMobileMenuOpen(false)}>Docs</Link>
                        </nav>
                        <div className="mt-8 pt-8 border-t border-white/20 space-y-3 pb-6">
                            <Link href="/login" className="block w-full px-4 py-3 text-center text-base font-semibold rounded-full bg-[#B6252A] text-white" onClick={() => setIsMobileMenuOpen(false)}>{dict.nav.get_started}</Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hero Section */}
            <section className="relative min-h-screen flex flex-col overflow-hidden">
                <div className="absolute inset-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#1a0a0a] to-[#2a0a0a]" />
                    <div className="absolute top-[10%] right-[20%] w-[500px] h-[500px] bg-[#B6252A]/15 rounded-full blur-[150px]" />
                    <div className="absolute bottom-[20%] left-[10%] w-[400px] h-[400px] bg-[#B6252A]/10 rounded-full blur-[120px]" />
                </div>
                <div className="relative z-10 flex-1 max-w-7xl mx-auto px-6 lg:px-12 py-20 pt-24">
                    <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center min-h-[65vh]">
                        <div className="reveal order-2 lg:order-1">
                            <div className="hero-badge mb-5">
                                <Image src="/logo/tifa/tifa.png" alt="TIFA" width={28} height={28} className="w-7 h-7" />
                                <span>{dict.hero.badge}</span>
                            </div>
                            <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-4 leading-[1.05]">
                                <span className="text-white">{dict.hero.title_1}</span><br />
                                <span className="text-[#B6252A] font-extrabold">{dict.hero.title_2}</span><br />
                                <span className="text-[#B6252A] font-extrabold">{dict.hero.title_3}</span>
                                <span className="text-white"> {dict.hero.title_4}</span>
                            </h1>
                            <p className="text-base md:text-lg text-gray-400 mb-6 max-w-lg leading-relaxed">{dict.hero.subtitle}</p>
                            <div className="flex flex-wrap gap-4">
                                <a href="https://wa.me/6285179598393?text=Halo%20saya%20tertarik%20dengan%20TIFA!" target="_blank" rel="noopener noreferrer" className="btn-tifa inline-flex items-center gap-2 hover-lift">
                                    {dict.hero.cta_contact}
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                                </a>
                                <Link href="/tifa/docs" className="btn-hero-outline inline-flex items-center gap-2 hover-lift">
                                    Explore More
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                                </Link>
                            </div>
                        </div>
                        <div className="relative reveal-right delay-200 order-1 lg:order-2 flex justify-center lg:justify-end mt-12 lg:mt-16">
                            <div className="relative">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#B6252A]/20 rounded-full blur-[100px]" />
                                <Image src="/robot/tifa_front.png" alt="TIFA Robot" width={350} height={440} className="relative z-10 w-[180px] md:w-[230px] lg:w-[280px] h-auto object-contain drop-shadow-2xl animate-float" priority />
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-1 bg-gradient-to-r from-transparent via-[#B6252A]/50 to-transparent rounded-full" />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="relative z-10 w-full">
                    <div className="supported-by-section reveal-slide-up">
                        <p className="text-gray-500 text-sm font-medium text-center mb-8 reveal-scale">{dict.hero.powered_by}</p>
                        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12 lg:gap-16 max-w-4xl mx-auto">
                            <div className="reveal-scale" style={{ transitionDelay: '0.1s' }}><Image src="/logo/partners/telkom_black.png" alt="Telkom University" width={140} height={45} className="h-9 md:h-11 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity" /></div>
                            <div className="reveal-scale" style={{ transitionDelay: '0.2s' }}><Image src="/logo/partners/btp.png" alt="Bandung Techno Park" width={160} height={60} className="h-14 md:h-16 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity" /></div>
                            <div className="reveal-scale" style={{ transitionDelay: '0.3s' }}><Image src="/logo/partners/fte.png" alt="Fakultas Teknik Elektro" width={200} height={80} className="h-16 md:h-20 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity" /></div>
                            <div className="reveal-scale" style={{ transitionDelay: '0.4s' }}><Image src="/logo/partners/pda.png" alt="PDA" width={100} height={45} className="h-9 md:h-11 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity" /></div>
                            <div className="reveal-scale" style={{ transitionDelay: '0.5s' }}><Image src="/logo/partners/telu_coffee.png" alt="Telu Coffee" width={120} height={120} className="h-16 md:h-20 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity" /></div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Start Your Journey Section */}
            <section id="about" className="relative py-20 lg:py-28 overflow-hidden">
                <div className="absolute inset-0">
                    <div className="absolute inset-0 bg-gradient-to-r from-[#1a0a0a] via-[#3a0f0f] to-[#B6252A]" />
                    <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px)' }} />
                </div>
                <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
                    <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-8">
                        <div className="flex-1 reveal text-center lg:text-left">
                            <p className="text-gray-300 text-xl md:text-3xl italic mb-6">{dict.about.subtitle}</p>
                            <h2 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-tight">
                                {dict.about.title_1}<br />{dict.about.title_2}<br /><span className="font-black">{dict.about.title_3}</span>
                            </h2>
                        </div>
                        <div className="flex-1 relative reveal-right delay-200">
                            <div className="relative w-full max-w-[550px] mx-auto lg:mx-0 lg:ml-auto">
                                <div className="relative">
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] md:w-[300px] lg:w-[350px] h-[350px] lg:h-[450px] bg-black/60 rounded-full blur-[80px] pointer-events-none" />
                                    <Image src="/robot/tifa_side.png" alt="TIFA Robot" width={400} height={550} className="relative z-10 w-[280px] md:w-[320px] lg:w-[380px] h-auto object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] mx-auto" priority />
                                </div>
                                <div className="absolute top-[25%] right-[-50px] md:right-[-70px] lg:right-[-90px] z-20 animate-float">
                                    <div className="bg-[#2a2a2a] rounded-2xl p-3 shadow-2xl border border-gray-700/50">
                                        <Image src="/robot/tifa_head_new.png" alt="TIFA Side Profile" width={250} height={200} className="w-[180px] md:w-[220px] lg:w-[250px] h-auto object-contain rounded-xl" />
                                    </div>
                                </div>
                                <div className="absolute top-[50%] left-[-40px] md:left-[-60px] lg:left-[-80px] z-20 animate-float" style={{ animationDelay: '0.5s' }}>
                                    <div className="bg-[#2a2a2a] rounded-2xl p-3 shadow-2xl border border-gray-700/50">
                                        <Image src="/robot/tifa_head_new_2.png" alt="TIFA Head" width={250} height={200} className="w-[180px] md:w-[220px] lg:w-[250px] h-auto object-contain rounded-xl" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Journey of TIFA Section */}
            <section id="journey" className="relative py-24 overflow-hidden">
                <div className="absolute inset-0">
                    <Image src="/photos/journey_image.png" alt="Journey Background" fill className="object-cover" />
                    <div className="absolute inset-0 bg-black/80" />
                </div>
                <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-12">
                    <div className="text-center mb-12 reveal">
                        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-10">{dict.journey.title}</h2>
                        <div className="relative inline-block">
                            <div className="absolute -inset-4 bg-gradient-to-r from-transparent via-[#B6252A]/10 to-transparent blur-2xl rounded-full" />
                            <p className="relative text-gray-300 max-w-4xl mx-auto leading-relaxed text-lg md:text-xl font-light px-4">
                                {dict.journey.description}
                            </p>
                        </div>
                    </div>
                    <div className="text-center mb-20 reveal delay-200">
                        <div className="relative group mx-auto max-w-4xl">
                            <div className="absolute -inset-1 bg-gradient-to-r from-transparent via-[#B6252A]/20 to-transparent rounded-[2rem] blur-xl opacity-50 group-hover:opacity-100 transition-all duration-700" />
                            <div className="relative bg-gradient-to-b from-[#151515] to-[#0a0a0a] border border-white/5 p-8 md:p-12 rounded-[2rem] shadow-2xl overflow-hidden text-left">
                                <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-[#B6252A]/10 rounded-full blur-3xl" />
                                <svg className="absolute -top-4 -left-4 w-32 h-32 text-white/5 -rotate-12" fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" /></svg>
                                
                                <div className="absolute left-0 top-8 bottom-8 w-2 bg-gradient-to-b from-[#B6252A] to-[#ff4d54] rounded-r-xl" />
                                
                                <div className="relative z-10 pl-6 md:pl-10">
                                    <p className="text-xl md:text-2xl font-light italic text-gray-200 leading-relaxed tracking-wide">
                                        {dict.journey.quote}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="relative">
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#B6252A] via-[#B6252A] to-transparent transform -translate-x-1/2 hidden lg:block" />
                        <div className="space-y-16 lg:space-y-24">
                            {journeyItems.map((item, index) => (
                                <div key={index} className={`relative flex flex-col lg:flex-row items-center gap-8 lg:gap-16 ${item.align === 'right' ? 'lg:flex-row-reverse' : ''}`}>
                                    <div className="absolute left-1/2 transform -translate-x-1/2 w-4 h-4 bg-[#B6252A] rounded-full border-4 border-[#1a1a1a] z-10 hidden lg:block" />
                                    <div className={`flex-1 ${item.align === 'left' ? 'lg:pr-12' : 'lg:pl-12'} reveal-${item.align === 'left' ? 'left' : 'right'}`}>
                                        <div className="relative rounded-2xl overflow-hidden bg-[#2a2a2a] p-4 shadow-2xl border border-gray-700/30 max-w-md mx-auto lg:mx-0 lg:ml-auto">
                                            <Image src={item.image} alt={item.title} width={350} height={280} className="w-full h-auto object-contain rounded-xl" />
                                        </div>
                                    </div>
                                    <div className={`flex-1 ${item.align === 'left' ? 'lg:pl-12 lg:text-left' : 'lg:pr-12 lg:text-right'} text-center reveal-${item.align === 'left' ? 'right' : 'left'} delay-200`}>
                                        <h3 className="text-2xl md:text-3xl font-bold text-white mb-4 underline decoration-[#B6252A] decoration-2 underline-offset-8">{item.title}</h3>
                                        <p className="text-gray-300 font-medium leading-relaxed text-sm md:text-base">{item.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Exclusive Restaurant Robot Section */}
            <section id="services" className="py-20 lg:py-28 relative overflow-hidden">
                <div className="absolute inset-0">
                    <Image src="/photos/tifa_in_telcoff.jpeg" alt="TIFA in Restaurant" fill className="object-cover object-[75%_center]" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#1F1F1F] via-[#1F1F1F]/80 to-[#1F1F1F]/40" />
                </div>
                <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
                    <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                        <div className="reveal">
                            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 leading-tight">
                                <span className="text-white">{dict.features.title_1}</span><br />
                                <span className="text-[#B6252A] font-extrabold">{dict.features.title_2}</span><br />
                                <span className="text-white">{dict.features.title_3}</span>
                            </h2>
                            <p className="text-gray-400 leading-relaxed text-base md:text-lg max-w-md">{dict.features.subtitle}</p>
                        </div>
                        <div className="reveal-right delay-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8 md:pb-12">
                                {[dict.features.card_1, dict.features.card_2, dict.features.card_3, dict.features.card_4].map((card, idx) => (
                                    <div key={idx} className="group relative backdrop-blur-xl bg-black/40 rounded-3xl p-6 md:p-8 border border-white/10 shadow-2xl hover:border-[#B6252A]/50 hover:bg-black/60 transition-all duration-500 hover:-translate-y-2 overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-br from-[#B6252A]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                        <div className="relative z-10">
                                            <div className="flex flex-col gap-4 mb-4">
                                                <div className="w-14 h-14 flex-shrink-0 bg-gradient-to-br from-[#B6252A]/30 to-black/50 border border-[#B6252A]/30 rounded-2xl flex items-center justify-center group-hover:bg-[#B6252A] group-hover:border-[#B6252A] group-hover:rotate-6 transition-all duration-500 shadow-lg shadow-[#B6252A]/20">
                                                    <svg className="w-7 h-7 text-[#B6252A] group-hover:text-white transition-colors duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                </div>
                                                <h3 className="text-white font-bold text-xl leading-tight">{card.title}</h3>
                                            </div>
                                            <p className="text-gray-300 text-sm leading-relaxed">{card.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Product Overview & Video Section */}
            <section id="product" className="py-24 bg-white text-[#1F1F1F]">
                <div className="max-w-7xl mx-auto px-6 lg:px-12">
                    <div className="text-center mb-16 reveal">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">{dict.product.title}</h2>
                        <p className="text-gray-600 max-w-2xl mx-auto">{dict.product.subtitle}</p>
                    </div>
                    <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                        <div className="reveal-left">
                            <div className="relative">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[380px] bg-[#B6252A]/15 rounded-full blur-[80px] pointer-events-none" />
                                <Image src="/robot/tifa_front.png" alt="TIFA Robot" width={400} height={500} className="relative z-10 w-80 mx-auto h-auto object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.3)]" />
                            </div>
                        </div>
                        <div className="reveal-right delay-200">
                            <div className="bg-gray-50 rounded-2xl p-8">
                                <h3 className="text-xl font-bold mb-6 text-[#B6252A]">{dict.product.specs_title}</h3>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-4 py-3 border-b border-gray-200">
                                        <span className="font-semibold text-gray-800">{dict.product.specs.feature}</span>
                                        <span className="text-gray-600">{dict.product.specs.value}</span>
                                        <span className="text-gray-600">{dict.product.specs.details}</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 py-3 border-b border-gray-100">
                                        <span className="font-medium text-gray-700">{dict.product.specs.payload}</span>
                                        <span className="text-gray-600">{dict.product.specs.payload_value}</span>
                                        <span className="text-gray-500 text-sm">{dict.product.specs.payload_details}</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 py-3 border-b border-gray-100">
                                        <span className="font-medium text-gray-700">{dict.product.specs.battery}</span>
                                        <span className="text-gray-600">{dict.product.specs.battery_value}</span>
                                        <span className="text-gray-500 text-sm">{dict.product.specs.battery_details}</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 py-3 border-b border-gray-100">
                                        <span className="font-medium text-gray-700">{dict.product.specs.navigation}</span>
                                        <span className="text-gray-600">{dict.product.specs.navigation_value}</span>
                                        <span className="text-gray-500 text-sm">{dict.product.specs.navigation_details}</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 py-3 border-b border-gray-100">
                                        <span className="font-medium text-gray-700">{dict.product.specs.speed}</span>
                                        <span className="text-gray-600">{dict.product.specs.speed_value}</span>
                                        <span className="text-gray-500 text-sm">{dict.product.specs.speed_details}</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 py-3 border-b border-gray-100">
                                        <span className="font-medium text-gray-700">{dict.product.specs.display}</span>
                                        <span className="text-gray-600">{dict.product.specs.display_value}</span>
                                        <span className="text-gray-500 text-sm">{dict.product.specs.display_details}</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 py-3">
                                        <span className="font-medium text-gray-700">{dict.product.specs.voice}</span>
                                        <span className="text-gray-600">{dict.product.specs.voice_value}</span>
                                        <span className="text-gray-500 text-sm">{dict.product.specs.voice_details}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-8">
                                <a href="https://wa.me/6285179598393?text=Halo%20saya%20ingin%20order%20TIFA!" target="_blank" rel="noopener noreferrer" className="btn-tifa inline-flex items-center justify-center gap-2 w-full">
                                    {dict.product.cta_order}
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                                </a>
                            </div>
                            
                            {/* Compact Video Demo Banner */}
                            <div className="mt-6 relative rounded-2xl overflow-hidden bg-[#151515] flex items-center justify-between p-4 px-6 group cursor-pointer shadow-lg hover:shadow-xl border border-transparent hover:border-[#B6252A]/50 transition-all duration-500 hover:-translate-y-1">
                                <div className="absolute inset-0 bg-gradient-to-r from-[#B6252A]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                <div className="relative z-10 flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-[#B6252A] group-hover:scale-110 transition-all duration-500 shadow-sm">
                                        <svg className="w-5 h-5 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                    </div>
                                    <div>
                                        <p className="text-white font-bold text-base">{dict.video.placeholder}</p>
                                        <p className="text-gray-400 text-xs mt-0.5">{dict.video.play_text}</p>
                                    </div>
                                </div>
                                <div className="relative z-10">
                                    <svg className="w-6 h-6 text-gray-500 group-hover:text-[#B6252A] group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section id="contact" className="py-16 lg:py-24 bg-white">
                <div className="max-w-5xl mx-auto px-6 lg:px-12">
                    <div className="reveal">
                        <div className="relative bg-gradient-to-br from-[#1a1a1a] via-[#252525] to-[#1a1a1a] rounded-3xl px-8 py-12 md:px-16 md:py-16 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-50" />
                            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                                <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-center md:text-left leading-tight">
                                    <span className="text-[#B6252A]">{dict.cta.title_1}</span><br /><span className="text-[#B6252A]">{dict.cta.title_2}</span>
                                </h2>
                                <a href="https://wa.me/6285179598393?text=Halo%20saya%20tertarik%20dengan%20TIFA!" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 px-8 py-4 bg-white text-[#1F1F1F] font-semibold rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300">
                                    {dict.cta.button}
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-[#151515] text-white py-16">
                <div className="max-w-7xl mx-auto px-6 lg:px-12">
                    <div className="grid md:grid-cols-4 gap-12 mb-12">
                        <div className="md:col-span-2">
                            <div className="flex items-center gap-3 mb-6">
                                <Image src="/logo/tifa/tifa.png" alt="TIFA" width={64} height={32} className="w-16 h-8" />
                            </div>
                            <p className="text-gray-400 leading-relaxed max-w-md mb-6">{dict.footer.description}</p>
                            <Link href="/" className="inline-flex items-center gap-2 text-[#2FAEB7] font-semibold hover:gap-3 transition-all">
                                {dict.footer.back_to_diagonal}
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                            </Link>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-6">{dict.footer.quick_links}</h4>
                            <ul className="space-y-4 text-gray-400">
                                <li><button onClick={scrollToTop} className="hover:text-[#B6252A] transition-colors text-left">{dict.nav.home}</button></li>
                                <li><button onClick={() => scrollToSection('about')} className="hover:text-[#B6252A] transition-colors text-left">{dict.nav.about}</button></li>
                                <li><button onClick={() => scrollToSection('services')} className="hover:text-[#B6252A] transition-colors text-left">{dict.nav.services}</button></li>
                                <li><button onClick={() => scrollToSection('product')} className="hover:text-[#B6252A] transition-colors text-left">{dict.nav.product}</button></li>
                                <li><button onClick={() => scrollToSection('contact')} className="hover:text-[#B6252A] transition-colors text-left">{dict.nav.contact}</button></li>
                                <li><Link href="/tifa/docs" className="hover:text-[#B6252A] transition-colors">Docs</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-6">{dict.footer.contact}</h4>
                            <ul className="space-y-4 text-gray-400">
                                <li className="flex items-center gap-3"><svg className="w-5 h-5 text-[#B6252A]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>diagonalroboticsolution@gmail.com</li>
                                <li className="flex items-center gap-3"><svg className="w-5 h-5 text-[#B6252A]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>+62 851-7959-8393</li>
                                <li className="flex items-center gap-3"><svg className="w-5 h-5 text-[#B6252A]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>Bandung, Indonesia</li>
                                <li><a href="https://wa.me/6285179598393?text=Halo%20saya%20tertarik%20dengan%20TIFA!" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-4 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>{dict.footer.whatsapp}</a></li>
                            </ul>
                        </div>
                    </div>
                    <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-gray-500 text-sm">© {new Date().getFullYear()} {dict.footer.copyright}</p>
                        <div className="flex gap-6 text-gray-500 text-sm">
                            <a href="#" className="hover:text-white transition-colors">{dict.footer.privacy}</a>
                            <a href="#" className="hover:text-white transition-colors">{dict.footer.terms}</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}

export default function TIFAJourneyPage() {
    return (
        <LanguageProvider>
            <TIFAContent />
        </LanguageProvider>
    );
}
