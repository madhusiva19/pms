'use client';

/**
 * Reports Listing Page
 * Displays a grid of countries to select for detailed reporting
 */

import { logger } from '@/utils/logger';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, BarChart2 } from 'lucide-react';
import CountryCard from '@/components/shared/CountryCard';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import SearchInput from '@/components/shared/SearchInput';
import EmptyState from '@/components/shared/EmptyState';
import { countriesApi } from '@/services/api';
import type { Country } from '@/types';

export default function ReportsListingPage() {
  const router = useRouter();
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchCountries = async () => {
      try {
        setLoading(true);
        const data = await countriesApi.getAll();
        setCountries(data || []);
      } catch (error) {
        logger.error('Failed to fetch countries for HQ admin reports', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCountries();
  }, []);

  const filteredCountries = countries.filter(country =>
    country.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-2 pb-10 flex flex-col gap-8">
      <div className="max-w-[1225px] mx-auto w-full flex flex-col gap-8">

        {/* Title & Stats Overview */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-[15px] text-[#4A5565]">
              Select a country to view detailed performance metrics and generate reports.
            </p>
          </div>

          {/* Workforce Report button */}
          <button
            type="button"
            onClick={() => router.push('/hq-admin/workforce-report')}
            className="flex items-center gap-2 px-4 py-2.5 text-[#155DFC] text-[13.5px] font-medium rounded-lg border border-[#155DFC] bg-white hover:bg-[#EFF6FF] active:scale-[0.98] transition-all"
          >
            <BarChart2 className="w-4 h-4" />
            Workforce Report
          </button>
        </div>

        {/* Search bar */}
        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search country..." />

        {/* Countries Grid */}
        {filteredCountries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCountries.map((country) => (
              <CountryCard key={country.id} country={country} />
            ))}
          </div>
        ) : (
          <EmptyState icon={MapPin} message={`No countries found matching "${searchTerm}"`} />
        )}
      </div>
    </div>
  );
}
