export interface DhanConfig {
    clientId: string;
    accessToken: string;
}

export interface DhanProfile {
    dhanClientId: string;
    tokenValidity: string;
    activeSegment: string;
    ddpi: string;
    mtf: string;
    dataPlan: string;
    dataValidity: string;
}

export interface DhanOptionChainParams {
    UnderlyingScrip: number;
    UnderlyingSeg: string;
    Expiry: string;
}

export interface DhanOptionItem {
    last_price: number;
    oi: number;
    volume: number;
    implied_volatility: number;
    previous_close_price: number;
    previous_oi: number;
    previous_volume: number;
    top_ask_price: number;
    top_ask_quantity: number;
    top_bid_price: number;
    top_bid_quantity: number;
    greeks: {
        delta: number;
        theta: number;
        gamma: number;
        vega: number;
    };
}

export interface DhanOptionChainResponse {
    status: string;
    data: {
        last_price: number;
        oc: {
            [strike: string]: {
                ce?: DhanOptionItem;
                pe?: DhanOptionItem;
            }
        }
    }
}

export interface DhanFundLimit {
    dhanClientId: string;
    availabelBalance: number;
    sodLimit: number;
    collateralAmount: number;
    receiveableAmount: number;
    utilizedAmount: number;
    blockedPayoutAmount: number;
    withdrawableBalance: number;
}

export interface DhanPosition {
    dhanClientId: string;
    tradingSymbol: string;
    securityId: string;
    positionType: string;
    exchangeSegment: string;
    productType: string;
    buyQty: number;
    sellQty: number;
    buyAvg: number;
    sellAvg: number;
    netQty: number;
    realizedProfit: number;
    unrealizedProfit: number;
    rbiReferenceRate: number;
    chainIn: number;
    costPrice: number;
}

export interface DhanHoldings {
    holdingId: string;
    securityId: string;
    tradingSymbol: string;
    exchange: string;
    isin: string;
    t1Qty: number;
    totalQty: number;
    dpQty: number;
    availableQty: number;
    collateralQty: number;
    avgCostPrice: number;
}
