import { useEffect } from "react";

const SITE = "پروازیاب";

/** Per-page `<title>`, so tabs, history and screen readers identify the page. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE}` : `${SITE} | مقایسه قیمت بلیط هواپیما`;
  }, [title]);
}
