import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let number = searchParams.get("number")?.trim() ?? "";
  if (!number)
    return NextResponse.json({ valid: false, error: "RNC no proporcionado" });

  number = number.replace(/[^0-9]/g, "");

  try {
    const formPage = await fetch(
      "https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx"
    );
    const htmlForm = await formPage.text();
    const $form    = cheerio.load(htmlForm);

    const viewState          = $form("#__VIEWSTATE").val()          || "";
    const eventValidation    = $form("#__EVENTVALIDATION").val()    || "";
    const viewStateGenerator = $form("#__VIEWSTATEGENERATOR").val() || "";

    const response = await fetch(
      "https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: new URLSearchParams({
          "__EVENTTARGET":                 "",
          "__EVENTARGUMENT":               "",
          "__VIEWSTATE":                   viewState.toString(),
          "__VIEWSTATEGENERATOR":          viewStateGenerator.toString(),
          "__EVENTVALIDATION":             eventValidation.toString(),
          "ctl00$cphMain$hidActiveTab":    "rnc",
          "ctl00$cphMain$txtRNCCedula":    number,
          "ctl00$cphMain$btnBuscarPorRNC": "BUSCAR",
        }).toString(),
      }
    );

    const html = await response.text();
    const $    = cheerio.load(html);

    const name = $("#cphMain_dvDatosContribuyentes td")
      .filter((_i, el) => $(el).text().trim() === "Nombre/Razón Social")
      .next().text().trim();

    const rncResult = $("#cphMain_dvDatosContribuyentes td")
      .filter((_i, el) => $(el).text().trim() === "Cédula/RNC")
      .next().text().trim();

    if (name && rncResult)
      return NextResponse.json({ valid: true, name, rnc: rncResult.replace(/[^0-9]/g, "") });

    return NextResponse.json({ valid: false });
  } catch (error) {
    console.error("❌ Error al consultar DGII:", error);
    return NextResponse.json({ valid: false, error: "Error al consultar DGII" });
  }
}