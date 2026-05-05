import './v0.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LawOS V0',
  description: '변호사 사무실 디지털 운영 OS',
};

export default function V0Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
