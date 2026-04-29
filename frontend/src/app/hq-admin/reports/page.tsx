'use client';

/**
 * Reports Listing Page
 * Displays a grid of countries to select for detailed reporting
 */

import React, { useState, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import CountryCard from '@/components/CountryCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import Breadcrumb from '@/components/Breadcrumb';
import SearchInput from '@/components/SearchInput';
import EmptyState from '@/components/EmptyState';
import { countriesApi } from '@/services/api';
import type { Country } from '@/types';

export default function ReportsListingPage() {
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
        console.error('Error fetching countries:', error);
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

        {/* Breadcrumb */}
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Reports' }]} />

        {/* Title & Stats Overview */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Performance Reports</h1>
            <p className="text-[15px] text-[#4A5565]">
              Select a country to view detailed performance metrics and generate reports.
            </p>
          </div>
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