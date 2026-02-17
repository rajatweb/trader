'use client';

import Link from 'next/link';
import { Activity, LayoutGrid, Terminal, Cpu, Zap, CloudLightning } from 'lucide-react';

const apps = [
    { id: '1', name: 'Option Chain', description: 'Advanced option chain with OI analysis and Greeks.', icon: LayoutGrid, href: '/apps/option-chain', color: 'text-[#387ed1]', bg: 'bg-blue-50' },
    { id: '2', name: 'Strategy Builder', description: 'Build and analyze multi-leg option strategies.', icon: Activity, href: '/apps/strategy', color: 'text-[#ff5722]', bg: 'bg-orange-50' },
    { id: '3', name: 'Pacing API', description: 'High frequency data access for algo traders.', icon: Cpu, href: '/apps/api', color: 'text-[#26a69a]', bg: 'bg-green-50' },
    { id: '4', name: 'Streak', description: 'Algo trading without coding.', icon: Zap, href: '/apps/streak', color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { id: '5', name: 'Sensibull', description: 'Simplest options trading platform.', icon: CloudLightning, href: '/apps/sensibull', color: 'text-purple-600', bg: 'bg-purple-50' },
    { id: '6', name: 'Smallcase', description: 'Thematic investment platform.', icon: Terminal, href: '/apps/smallcase', color: 'text-indigo-600', bg: 'bg-indigo-50' },
];

export default function AppsPage() {
    return (
        <div className="flex-1 bg-[#f9f9f9] h-full overflow-y-auto p-12 text-[#444]">

            {/* Header */}
            <h1 className="text-3xl font-light text-[#444] mb-12 flex items-center gap-2">
                Apps
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {apps.map((app) => (
                    <Link href={app.href} key={app.id} className="group block h-full">
                        <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-all h-full cursor-pointer flex flex-col items-start gap-4 transform hover:-translate-y-1">
                            <div className={`p-4 rounded-full ${app.bg} ${app.color} mb-2`}>
                                <app.icon size={28} strokeWidth={1.5} />
                            </div>
                            <div>
                                <h3 className="text-lg font-medium text-[#444] group-hover:text-[#387ed1] transition-colors">{app.name}</h3>
                                <p className="text-gray-500 text-sm mt-2 leading-relaxed font-light">{app.description}</p>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
