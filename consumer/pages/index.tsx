import { useEffect } from "react";
import { useRouter } from "next/router";
import { getUser, isLoggedIn } from "../utils/auth";

export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
    } else {
      const user = getUser();
      router.replace(user?.role === "1" ? "/admin" : "/dashboard");
    }
  }, [router]);

  return null;
}
