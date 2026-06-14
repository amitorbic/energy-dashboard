import "../styles/globals.css";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import CommissionLayout from "../components/CommissionLayout";
import ChatWidget from "../components/ChatWidget";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  const showWidget = router.pathname !== "/agent";

  if (
    router.pathname.startsWith("/commission") &&
    router.pathname !== "/commission"
  ) {
    return (
      <>
        <CommissionLayout>
          <Component {...pageProps} />
        </CommissionLayout>
        {showWidget && <ChatWidget />}
      </>
    );
  }

  return (
    <>
      <Component {...pageProps} />
      {showWidget && <ChatWidget />}
    </>
  );
}
