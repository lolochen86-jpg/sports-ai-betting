import React from 'react';
import SlateScannerDashboard from '../components/SlateScannerDashboard';

export const metadata = {
  title: '盤口掃描儀 - Slate Scanner Dashboard',
  description: 'AI 盤口大數據邊際優勢掃描器，過濾核心主推與受讓保險場次。',
};

export default function SlateScannerPage() {
  return (
    <main className="min-h-screen bg-[#070b19]">
      <SlateScannerDashboard />
    </main>
  );
}
