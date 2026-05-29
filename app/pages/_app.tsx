import "../styles/globals.css";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import CommissionLayout from "../components/CommissionLayout";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  if (
    router.pathname.startsWith("/commission") &&
    router.pathname !== "/commission"
  ) {
    return (
      <CommissionLayout>
        <Component {...pageProps} />
      </CommissionLayout>
    );
  }

  return <Component {...pageProps} />;
}
