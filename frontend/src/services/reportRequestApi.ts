// services/reportRequestApi.ts

import { supabase } from '@/lib/supabase';

export type ReportRequestStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ReportRequest {
    id: string;
    country_id: string;
    report_type: 'mid_year' | 'year_end';
    requested_by: string;
    requested_at: string;
    status: ReportRequestStatus;
    download_url?: string;
}

export const reportRequestApi = {

    // POST — Submit a new report generation request
    async create(
        countryId: string,
        reportType: 'mid_year' | 'year_end',
        requestedBy: string
    ): Promise<ReportRequest> {
        const { data, error } = await supabase
            .from('report_requests')
            .insert({
                country_id: countryId,
                report_type: reportType,
                requested_by: requestedBy,
                requested_at: new Date().toISOString(),
                status: 'pending',
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // PATCH — Update the status of a request (pending → completed or failed)
    async updateStatus(requestId: string, status: ReportRequestStatus): Promise<void> {
        const { error } = await supabase
            .from('report_requests')
            .update({ status })
            .eq('id', requestId);

        if (error) throw error;
    },

    // GET — Fetch the status of a specific request
    async getStatus(requestId: string): Promise<ReportRequest> {
        const { data, error } = await supabase
            .from('report_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (error) throw error;
        return data;
    },

    // GET — Fetch all download history for a country
    async getHistory(countryId: string): Promise<ReportRequest[]> {
        const { data, error } = await supabase
            .from('report_requests')
            .select('*')
            .eq('country_id', countryId)
            .order('requested_at', { ascending: false });

        if (error) throw error;
        return data ?? [];
    },

};