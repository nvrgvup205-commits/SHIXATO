import { WorkersAiService } from "./workers-ai";
import type { AliExpressSearchResult, Env } from "../types";

/** Post-process search hits: Arabic titles via Workers AI when AE returns English. */
export async function localizeSearchResults(
  env: Env,
  data: AliExpressSearchResult,
  locale?: string,
): Promise<AliExpressSearchResult> {
  if (locale === "en") return data;

  const ai = new WorkersAiService(env);
  const { listings, translated, provider } = await ai.arabicTitles(data.results);
  data.results = listings;

  if (translated > 0) {
    data.titlesTranslated = translated;
    const note = `تمت ترجمة ${translated} عنوانًا للعربية (${provider})`;
    data.warning = data.warning ? `${data.warning} — ${note}` : note;
  } else if (!env.AI && data.results.length > 0) {
    const note =
      "العناوين من AliExpress بالإنجليزي — فعّل Workers AI لترجمتها تلقائيًا";
    data.warning = data.warning ? `${data.warning} — ${note}` : note;
  }

  return data;
}
