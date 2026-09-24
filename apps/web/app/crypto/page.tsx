/**
 * /crypto — the dedicated crypto board (methodology Part IV). A scoped ScanApp:
 * ranks curated coins ∪ the user's (unlimited) crypto follows, 24/7 (no
 * market-closed hint), each coin analyzed with the tuned CRYPTO_CONFIG.
 */
import ScanApp from '../../components/ScanApp';

export const metadata = { title: 'Crypto — Thresher' };

export default function CryptoPage() {
  return <ScanApp scope="crypto" />;
}
