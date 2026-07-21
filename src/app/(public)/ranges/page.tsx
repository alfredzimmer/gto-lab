import type { Metadata } from "next";
import RangeExplorer from "./RangeExplorer";

export const metadata: Metadata = {
  title: "Ranges",
  description:
    "Walk the heads-up NLHE action tree and see the solved strategy for all 169 starting hands at every decision node.",
};

export default function RangesPage() {
  return <RangeExplorer />;
}
