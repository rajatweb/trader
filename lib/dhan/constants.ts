export const DHAN_ENDPOINTS = {
    BASE_URL: "https://api.dhan.co/v2",
    AUTH_BASE_URL: "https://auth.dhan.co",
    PATHS: {
        // Auth Flow (Individual API Key & Secret)
        GENERATE_CONSENT: "/app/generate-consent",
        LOGIN_CONSENT: "/login/consentApp-login", // Browser URL
        CONSUME_CONSENT: "/app/consumeApp-consent",
        RENEW_TOKEN: "/RenewToken",

        // Market Data APIs
        OPTION_CHAIN: "/optionchain",
        OPTION_CHAIN_EXPIRY: "/optionchain/expirylist",

        // Trading APIs
        ORDERS: "/orders",
        POSITIONS: "/portfolio/positions",
        HOLDINGS: "/portfolio/holdings",
        FUNDS: "/fund/limits",
        PROFILE: "/profile",
        TRADE_HISTORY: "/trades",

        // Charting APIs
        CHARTS_HISTORICAL: "/charts/historical",
        CHARTS_INTRADAY: "/charts/intraday",
        CHARTS_ROLLING: "/charts/rollingoption",

        // Static IP
        SET_IP: "/ip/setIP",
        MODIFY_IP: "/ip/modifyIP",
        GET_IP: "/ip/getIP"
    }
};
