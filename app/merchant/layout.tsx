'use client';

import { usePathname } from 'next/navigation';
import './marketplace.css';

export default function MerchantLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const isMarketplaceRoute = pathname === '/merchant/register'
    || pathname?.startsWith('/merchant/dashboard')
    || pathname?.startsWith('/merchant/portal');
  return isMarketplaceRoute ? <div className="mm-shell">{children}</div> : children;
}
