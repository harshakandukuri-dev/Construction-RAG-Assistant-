import { Suspense } from "react";
import DesignDetail from "./DesignDetail";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DesignDetail />
    </Suspense>
  );
}
