import Link from 'next/link';
import { Rings } from './Rings';

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="나이테 처음으로">
      <Rings size={26} />
      나이테
    </Link>
  );
}
