import { DhanConfig, DhanProfile, DhanFundLimit, DhanPosition, DhanHoldings } from './types';
import { DHAN_ENDPOINTS } from './constants';

export class DhanClient {
    private config: DhanConfig;

    constructor(config: DhanConfig) {
        this.config = config;
    }

    private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        const url = `${DHAN_ENDPOINTS.BASE_URL}${path}`;
        const headers = {
            'access-token': (this.config.accessToken || '').trim(),
            'client-id': (this.config.clientId || '').trim(),
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        } as HeadersInit;

        const response = await fetch(url, {
            ...options,
            headers,
        });

        if (!response.ok) {
            let errorDetail = '';
            try {
                const errorJson = await response.json();
                errorDetail = JSON.stringify(errorJson);
            } catch (e) {
                errorDetail = await response.text();
            }
            throw new Error(`Dhan API Error: ${response.status} - ${errorDetail}`);
        }

        return response.json();
    }

    public async getProfile(): Promise<DhanProfile> {
        return this.request<DhanProfile>(DHAN_ENDPOINTS.PATHS.PROFILE);
    }

    public async getFunds(): Promise<DhanFundLimit> {
        return this.request<DhanFundLimit>(DHAN_ENDPOINTS.PATHS.FUNDS);
    }

    public async getPositions(): Promise<DhanPosition[]> {
        return this.request<DhanPosition[]>(DHAN_ENDPOINTS.PATHS.POSITIONS);
    }

    public async getHoldings(): Promise<DhanHoldings[]> {
        return this.request<DhanHoldings[]>(DHAN_ENDPOINTS.PATHS.HOLDINGS);
    }

    public async getOptionChainExpiry(underlyingScrip: number, underlyingSeg: string): Promise<string[]> {
        // Expiry List API prefers PascalCase as per docs
        const res = await this.request<{ data: string[], status: string }>(DHAN_ENDPOINTS.PATHS.OPTION_CHAIN_EXPIRY, {
            method: 'POST',
            body: JSON.stringify({
                UnderlyingScrip: Number(underlyingScrip),
                UnderlyingSeg: underlyingSeg
            })
        });
        return res.data;
    }

    public async getOptionChain(params: { underlyingScrip: number; underlyingSeg: string; expiry: string }): Promise<any> {
        // Full Option Chain API prefers camelCase
        const res = await this.request<{ data: any, status: string }>(DHAN_ENDPOINTS.PATHS.OPTION_CHAIN, {
            method: 'POST',
            body: JSON.stringify({
                underlyingScrip: Number(params.underlyingScrip),
                underlyingSeg: params.underlyingSeg,
                expiry: params.expiry
            })
        });
        return res.data;
    }

    public async getHistoricalData(params: {
        securityId: string;
        exchangeSegment: string;
        instrument: string;
        expiryCode?: number;
        oi?: boolean;
        fromDate: string;
        toDate: string;
    }): Promise<any> {
        return this.request(DHAN_ENDPOINTS.PATHS.CHARTS_HISTORICAL, {
            method: 'POST',
            body: JSON.stringify(params)
        });
    }

    public async getIntradayData(params: {
        securityId: string;
        exchangeSegment: string;
        instrument: string;
        interval: string;
        oi?: boolean;
        fromDate: string;
        toDate: string;
    }): Promise<any> {
        return this.request(DHAN_ENDPOINTS.PATHS.CHARTS_INTRADAY, {
            method: 'POST',
            body: JSON.stringify(params)
        });
    }

    public async getRollingOptionData(params: {
        securityId: string;
        exchangeSegment: string;
        instrument: string;
        expiryFlag: 'WEEK' | 'MONTH';
        expiryCode: number;
        strike: string;
        drvOptionType: 'CALL' | 'PUT';
        requiredData: string[];
        fromDate: string;
        toDate: string;
        interval: string;
    }): Promise<any> {
        return this.request(DHAN_ENDPOINTS.PATHS.CHARTS_ROLLING, {
            method: 'POST',
            body: JSON.stringify(params)
        });
    }

    public async validateSession(): Promise<boolean> {
        try {
            await this.getProfile();
            return true;
        } catch (error) {
            console.error('Session validation failed:', error);
            return false;
        }
    }
}
