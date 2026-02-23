const assert = require('assert');

let orders = [];
let watchlist = [{ securityId: '1', ltp: 100 }];
let positions = [{ securityId: '1', quantity: 1, avgBuyPrice: 100 }];

// 1. Simulate placing an SL from Positions page (Long position)
const suggestedTrigger = 100 * 0.98; // 98
let currentPrice = 100;

let order = {
    orderId: '123',
    securityId: '1',
    status: 'OPEN',
    side: 'SELL',
    orderType: 'SL',
    price: 100, // Limit price defaults to pos.ltp
    triggerPrice: suggestedTrigger,
    quantity: 1
};
orders.push(order);

// 2. Simulate checkAndTriggerSLOrders
function check() {
    const slOrders = orders.filter(o => o.status === 'OPEN' && ['SL', 'SL-M'].includes(o.orderType));
    
    slOrders.forEach(o => {
        const instr = watchlist.find(w => w.securityId === o.securityId);
        const ltp = instr.ltp;
        let shouldTrigger = false;
        if (o.side === 'BUY') {
            shouldTrigger = ltp >= o.triggerPrice;
        } else {
            shouldTrigger = ltp <= o.triggerPrice;
        }
        
        console.log(`Checking SL: side=${o.side}, ltp=${ltp}, trigger=${o.triggerPrice} -> shouldTrigger=${shouldTrigger}`);
        
        if (shouldTrigger) {
            let executionPrice;
            if (o.orderType === 'SL-M') {
                executionPrice = ltp;
            } else {
                executionPrice = o.price;
                const canFill = o.side === 'BUY' ? ltp <= executionPrice : ltp >= executionPrice;
                console.log(`canFill: ${canFill}`);
                if (!canFill) return;
            }
            console.log("EXECUTED!");
        }
    });
}

console.log("Initial state (price=100)");
check();

watchlist[0].ltp = 98;
console.log("\nPrice drops to 98");
check();

watchlist[0].ltp = 97;
console.log("\nPrice drops to 97");
check();

