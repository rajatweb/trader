'use client';

import { useState } from 'react';
import { Download, Search, Clock, Edit2, X } from 'lucide-react';
import { useTradingStore } from '@/lib/store';
import OrderModal from '@/app/components/OrderModal';

export default function OrdersPage() {
    const { orders, cancelOrder } = useTradingStore();
    const [activeTab, setActiveTab] = useState('All Orders');
    const [statusFilter, setStatusFilter] = useState('All'); // For All Orders sub-filter
    const [searchTerm, setSearchTerm] = useState('');
    const [editingOrder, setEditingOrder] = useState<any>(null);

    // Filter orders based on active tab and status filter
    const getFilteredOrders = () => {
        let filtered = orders;

        if (activeTab === 'Open Orders') {
            filtered = orders.filter(order => order.status === 'OPEN' || order.status === 'PENDING');
        } else if (activeTab === 'All Orders') {
            // Apply status filter for All Orders
            if (statusFilter !== 'All') {
                filtered = orders.filter(order => order.status === statusFilter);
            }
        }

        if (searchTerm) {
            filtered = filtered.filter(order =>
                order.symbol.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        return filtered;
    };

    const filteredOrders = getFilteredOrders();

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'EXECUTED':
                return 'text-green-600 bg-green-50';
            case 'REJECTED':
            case 'CANCELLED':
                return 'text-red-600 bg-red-50';
            case 'OPEN':
                return 'text-blue-600 bg-blue-50';
            case 'PENDING':
                return 'text-yellow-600 bg-yellow-50';
            default:
                return 'text-gray-600 bg-gray-50';
        }
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Sub-navigation */}
            <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100 overflow-x-auto">
                <div className="flex gap-8 whitespace-nowrap">
                    {['All Orders', 'Open Orders', 'GTT', 'Baskets'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`text-sm font-medium transition-colors ${activeTab === tab ? 'text-[#ff5722]' : 'text-gray-500 hover:text-[#ff5722]'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="p-4 md:p-8 flex-1 overflow-auto">
                {(activeTab === 'All Orders' || activeTab === 'Open Orders') && (
                    <>
                        <h2 className="text-xl font-light text-[#444] mb-4 flex items-center gap-2">
                            {activeTab} <span className="text-gray-400">({filteredOrders.length})</span>
                        </h2>

                        {/* Status Filter Tabs - Only for All Orders */}
                        {activeTab === 'All Orders' && (
                            <div className="flex gap-4 mb-4 border-b border-gray-200 overflow-x-auto whitespace-nowrap pb-2 md:pb-0">
                                {['All', 'EXECUTED', 'OPEN', 'CANCELLED', 'REJECTED'].map((status) => (
                                    <button
                                        key={status}
                                        onClick={() => setStatusFilter(status)}
                                        className={`pb-2 px-1 text-xs font-medium transition-colors border-b-2 ${statusFilter === status
                                            ? 'text-[#387ed1] border-[#387ed1]'
                                            : 'text-gray-500 border-transparent hover:text-gray-700'
                                            }`}
                                    >
                                        {status}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="relative w-full md:w-auto">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={14} />
                                <input
                                    type="text"
                                    placeholder="Search"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 pr-4 py-1.5 border border-gray-200 rounded text-sm text-gray-600 focus:outline-none focus:border-gray-400 w-full md:w-64"
                                />
                            </div>
                            <div className="hidden md:flex gap-4 text-xs text-[#387ed1] font-medium cursor-pointer">
                                <span className="flex items-center gap-1 hover:text-blue-700"><Download size={12} /> Contract note</span>
                                <span className="flex items-center gap-1 hover:text-blue-700"><Download size={12} /> View history</span>
                                <span className="flex items-center gap-1 hover:text-blue-700"><Download size={12} /> Download</span>
                            </div>
                        </div>

                        {filteredOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                                <Clock size={48} className="mb-4 opacity-20" />
                                <p className="text-sm">No {activeTab.toLowerCase()} yet</p>
                                <p className="text-xs mt-2">Your order history will appear here</p>
                            </div>
                        ) : (
                            <div className="border border-gray-200 rounded-sm overflow-x-auto">
                                <table className="w-full text-left text-xs min-w-[800px]">
                                    <thead className="bg-[#f9f9f9] text-gray-500 border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-3 font-medium">Time</th>
                                            <th className="px-6 py-3 font-medium">Type</th>
                                            <th className="px-6 py-3 font-medium">Instrument</th>
                                            <th className="px-6 py-3 font-medium">Product</th>
                                            <th className="px-6 py-3 font-medium text-right">Qty.</th>
                                            <th className="px-6 py-3 font-medium text-right">Price</th>
                                            <th className="px-6 py-3 font-medium text-right">Trigger</th>
                                            <th className="px-6 py-3 font-medium text-right">Avg. price</th>
                                            <th className="px-6 py-3 font-medium text-right">Status</th>
                                            {activeTab === 'Open Orders' && <th className="px-6 py-3 font-medium text-right">Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredOrders.map((order) => (
                                            <tr key={order.orderId} className="hover:bg-[#fcfcfc] transition-colors">
                                                <td className="px-6 py-3 text-gray-500">{formatTime(order.timestamp)}</td>
                                                <td className="px-6 py-3">
                                                    <span className={`px-2 py-0.5 rounded-[2px] text-[10px] font-semibold uppercase ${order.side === 'BUY' ? 'bg-[#e3f2fd] text-[#387ed1]' : 'bg-[#fbe9e7] text-[#ff5722]'}`}>
                                                        {order.side}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 font-medium text-[#444]">{order.symbol}</td>
                                                <td className="px-6 py-3 text-gray-500 uppercase text-[10px]">{order.productType}</td>
                                                <td className="px-6 py-3 text-right text-[#444]">
                                                    {order.filledQty} / {order.quantity}
                                                </td>
                                                <td className="px-6 py-3 text-right text-[#444]">
                                                    {order.orderType === 'MARKET' ? 'Market' : `₹${order.price.toFixed(2)}`}
                                                    {order.orderType !== 'MARKET' && <span className="text-gray-400 ml-1 text-[10px]">{order.orderType}</span>}
                                                </td>
                                                <td className="px-6 py-3 text-right text-[#444]">
                                                    {order.triggerPrice ? `₹${order.triggerPrice.toFixed(2)}` : '-'}
                                                </td>
                                                <td className="px-6 py-3 text-right text-[#444]">
                                                    {order.avgPrice > 0 ? `₹${order.avgPrice.toFixed(2)}` : '-'}
                                                </td>
                                                <td className="px-6 py-3 text-right">
                                                    <span className={`px-2 py-0.5 rounded-[2px] text-[10px] font-semibold tracking-wide uppercase ${getStatusColor(order.status)}`}>
                                                        {order.status}
                                                    </span>
                                                </td>
                                                {activeTab === 'Open Orders' && (
                                                    <td className="px-6 py-3 text-right">
                                                        <div className="flex gap-2 justify-end">
                                                            <button
                                                                onClick={() => setEditingOrder(order)}
                                                                className="p-1.5 hover:bg-blue-50 rounded text-blue-600 transition-colors"
                                                                title="Edit Order"
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => cancelOrder(order.orderId)}
                                                                className="p-1.5 hover:bg-red-50 rounded text-red-600 transition-colors"
                                                                title="Cancel Order"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Order Modal for Editing */}
            {editingOrder && (
                <OrderModal
                    isOpen={true}
                    onClose={() => setEditingOrder(null)}
                    type={editingOrder.side === 'BUY' ? 'Buy' : 'Sell'}
                    symbol={editingOrder.symbol}
                    price={editingOrder.price}
                    securityId={editingOrder.securityId}
                    exchange={editingOrder.exchange}
                    segment={editingOrder.segment}
                    prefilledOrderType={editingOrder.orderType}
                    prefilledQuantity={editingOrder.quantity}
                    prefilledTriggerPrice={editingOrder.triggerPrice}
                    existingOrderId={editingOrder.orderId}
                />
            )}
        </div>
    );
}
