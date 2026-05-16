// Crea las 25 facturas de prueba en Firestore con los datos exactos del set DGII
// Luego el frontend llama /api/dgii/emitir para cada una — mismo flujo que producción

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import { FieldValue }                from "firebase-admin/firestore";

async function verificarSesion(req: NextRequest): Promise<string | null> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return null;
  try { return (await adminAuth.verifySessionCookie(cookie)).uid; }
  catch { return null; }
}

// ─── Cliente de prueba (proporcionado por DGII) ───────────────────────────────
const CLIENTE_PRUEBA = {
  id:        "dgii-test-131880681",
  rnc:       "131880681",
  nombre:    "DOCUMENTOS ELECTRONICOS DE PRUEBA DGII",
  tipo:      "juridica",
  subtipo:   "regular",
  direccion: "Santo Domingo, República Dominicana",
  ciudad:    "Santo Domingo",
  contacto:  "DGII",
  telefono:  "8096893444",
};

// ─── 25 facturas del set de pruebas (datos exactos del PDF DGII) ──────────────
// vencimientoECF: #e = sin vencimiento (E32) | fecha = con vencimiento
const CASOS_PRUEBA = [
  // E33 — Nota de Débito (modifica E320000000006)
  {
    eCF: "E330000000001", tipoECF: "E33", fecha: "2020-04-02",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    eCFRef: "E320000000006", motivoNota: "Ajuste de precio",
    clienteId: "dgii-test-131880681",
    items: [{ codigo:"LCH001", descripcion:"LECHE", modo:"por_persona", cant:1, pax:1,
              precio:400000, descuentoMonto:0, itbis:0, fechaTour:"2020-04-02" }],
  },
  // E32 — Consumo >= 250k (no necesita RFCE)
  {
    eCF: "E320000000006", tipoECF: "E32", fecha: "2020-04-01",
    vencimientoECF: "2099-12-31", terminos: "Contado",
    esConsumidorFinal: true, nombreConsumidor: "CONSUMIDOR FINAL",
    clienteId: "walk-in",
    items: [{ codigo:"LAP001", descripcion:"LAPICES", modo:"por_persona", cant:1, pax:10000,
              precio:35.08, descuentoMonto:0, itbis:0.18, fechaTour:"2020-04-01" }],
  },
  // E34 — Nota de Crédito (modifica E310000000001)
  {
    eCF: "E340000000001", tipoECF: "E34", fecha: "2020-04-02",
    vencimientoECF: "2099-12-31", terminos: "Contado",
    eCFRef: "E310000000001", motivoNota: "Error en datos",
    clienteId: "dgii-test-131880681",
    items: [{ codigo:"TOP001", descripcion:"TOP BOWL 1", modo:"por_persona", cant:1, pax:23,
              precio:0, descuentoMonto:0, itbis:0, fechaTour:"2020-04-02" }],
  },
  // E34 — Nota de Crédito (modifica E410000000010)
  {
    eCF: "E340000000016", tipoECF: "E34", fecha: "2020-12-01",
    vencimientoECF: "2099-12-31", terminos: "Contado",
    eCFRef: "E410000000010", motivoNota: "Actualización de servicio",
    clienteId: "dgii-test-131880681",
    items: [{ codigo:"SRV001", descripcion:"Servicio Profesional Legislativo Actualiz", modo:"por_persona", cant:1, pax:1,
              precio:0, descuentoMonto:0, itbis:0, fechaTour:"2020-12-01" }],
  },
  // E41 — Compras
  {
    eCF: "E410000000010", tipoECF: "E41", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    clienteId: "dgii-test-131880681",
    items: [{ codigo:"SRV002", descripcion:"Servicio Profesional Legislativo", modo:"por_persona", cant:1, pax:1,
              precio:15045.30, descuentoMonto:0, itbis:0.18, fechaTour:"2020-04-01" }],
  },
  // E31 — Crédito Fiscal
  {
    eCF: "E310000000001", tipoECF: "E31", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    clienteId: "dgii-test-131880681",
    items: [{ codigo:"ASW001", descripcion:"ASW DTU", modo:"por_persona", cant:1, pax:15,
              precio:400, descuentoMonto:0, itbis:0.18, fechaTour:"2020-04-01" }],
  },
  // E31 — Crédito Fiscal
  {
    eCF: "E310000000004", tipoECF: "E31", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    clienteId: "dgii-test-131880681",
    items: [{ codigo:"MES001", descripcion:"MESAS INDUSTRIALES", modo:"por_persona", cant:1, pax:1,
              precio:15548.04, descuentoMonto:0, itbis:0.18, fechaTour:"2020-04-01" }],
  },
  // E31 — Crédito Fiscal
  {
    eCF: "E310000000006", tipoECF: "E31", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    clienteId: "dgii-test-131880681",
    items: [{ codigo:"ARR001", descripcion:"ARROZ LA GARZA", modo:"por_persona", cant:1, pax:1,
              precio:133975, descuentoMonto:0, itbis:0.18, fechaTour:"2020-04-01" }],
  },
  // E31 — Crédito Fiscal
  {
    eCF: "E310000000002", tipoECF: "E31", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    clienteId: "dgii-test-131880681",
    items: [{ codigo:"PTE001", descripcion:"PTE. CJ 24/12OZ", modo:"por_persona", cant:1, pax:1,
              precio:3230, descuentoMonto:0, itbis:0, fechaTour:"2020-04-01" }],
  },
  // E32 — Consumo < 250k → RFCE primero
  {
    eCF: "E320000000011", tipoECF: "E32", fecha: "2020-04-01",
    vencimientoECF: "2099-12-31", terminos: "Contado",
    esConsumidorFinal: true, nombreConsumidor: "CONSUMIDOR FINAL",
    clienteId: "walk-in",
    items: [{ codigo:"CAR001", descripcion:"Cargador", modo:"por_persona", cant:1, pax:15,
              precio:2266.67, descuentoMonto:0, itbis:0.18, fechaTour:"2020-04-01" }],
  },
  // E32 — Consumo < 250k → RFCE primero
  {
    eCF: "E320000000013", tipoECF: "E32", fecha: "2020-04-01",
    vencimientoECF: "2099-12-31", terminos: "Contado",
    esConsumidorFinal: true, nombreConsumidor: "CONSUMIDOR FINAL",
    clienteId: "walk-in",
    items: [{ codigo:"NEV001", descripcion:"Nevera", modo:"por_persona", cant:1, pax:1,
              precio:95000, descuentoMonto:0, itbis:0.18, fechaTour:"2020-04-01" }],
  },
  // E32 — Consumo < 250k → RFCE primero
  {
    eCF: "E320000000014", tipoECF: "E32", fecha: "2020-04-01",
    vencimientoECF: "2099-12-31", terminos: "Contado",
    esConsumidorFinal: true, nombreConsumidor: "CONSUMIDOR FINAL",
    clienteId: "walk-in",
    items: [{ codigo:"BEL001", descripcion:"Articulos de belleza", modo:"por_persona", cant:1, pax:15,
              precio:673.33, descuentoMonto:0, itbis:0.18, fechaTour:"2020-04-01" }],
  },
  // E32 — Consumo < 250k → RFCE primero
  {
    eCF: "E320000000015", tipoECF: "E32", fecha: "2020-04-01",
    vencimientoECF: "2099-12-31", terminos: "Contado",
    esConsumidorFinal: true, nombreConsumidor: "CONSUMIDOR FINAL",
    clienteId: "walk-in",
    items: [{ codigo:"CEL001", descripcion:"Celular", modo:"por_persona", cant:1, pax:50,
              precio:1100, descuentoMonto:0, itbis:0.18, fechaTour:"2020-04-01" }],
  },
  // E32 — Consumo >= 250k (no necesita RFCE)
  {
    eCF: "E320000000004", tipoECF: "E32", fecha: "2020-04-01",
    vencimientoECF: "2099-12-31", terminos: "Contado",
    esConsumidorFinal: true, nombreConsumidor: "CONSUMIDOR FINAL",
    clienteId: "walk-in",
    items: [{ codigo:"BLK001", descripcion:"BLOCK", modo:"por_persona", cant:1, pax:100,
              precio:4842.50, descuentoMonto:0, itbis:0.18, fechaTour:"2020-04-01" }],
  },
  // E41 — Compras
  {
    eCF: "E410000000001", tipoECF: "E41", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    clienteId: "dgii-test-131880681",
    items: [{ codigo:"PUB001", descripcion:"SERVICIO PUBLICIDAD", modo:"por_persona", cant:1, pax:100,
              precio:100, descuentoMonto:0, itbis:0.18, fechaTour:"2020-04-01" }],
  },
  // E43 — Gastos Menores
  {
    eCF: "E430000000009", tipoECF: "E43", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    esConsumidorFinal: true, nombreConsumidor: "GASTO MENOR",
    clienteId: "walk-in",
    items: [{ codigo:"NEU001", descripcion:"Arreglo neumaticos", modo:"por_persona", cant:1, pax:20,
              precio:1, descuentoMonto:0, itbis:0, fechaTour:"2020-04-01" }],
  },
  // E43 — Gastos Menores
  {
    eCF: "E430000000010", tipoECF: "E43", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    esConsumidorFinal: true, nombreConsumidor: "GASTO MENOR",
    clienteId: "walk-in",
    items: [{ codigo:"COM001", descripcion:"Gasto personal en comida (kiosko)", modo:"por_persona", cant:1, pax:2,
              precio:6, descuentoMonto:0, itbis:0, fechaTour:"2020-04-01" }],
  },
  // E44 — Regímenes Especiales
  {
    eCF: "E440000000007", tipoECF: "E44", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    clienteId: "dgii-test-131880681",
    items: [{ codigo:"PTE002", descripcion:"PTE. CJ 24/12OZ", modo:"por_persona", cant:1, pax:2,
              precio:216000, descuentoMonto:0, itbis:0, fechaTour:"2020-04-01" }],
  },
  // E44 — Regímenes Especiales
  {
    eCF: "E440000000011", tipoECF: "E44", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    clienteId: "dgii-test-131880681",
    items: [{ codigo:"MER001", descripcion:"Mero Basa", modo:"por_persona", cant:1, pax:8,
              precio:454282.25, descuentoMonto:0, itbis:0, fechaTour:"2020-04-01" }],
  },
  // E45 — Gubernamental
  {
    eCF: "E450000000001", tipoECF: "E45", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    clienteId: "dgii-test-131880681",
    items: [{ codigo:"PUB002", descripcion:"SERVICIO PUBLICIDAD", modo:"por_persona", cant:1, pax:1,
              precio:30000, descuentoMonto:0, itbis:0.18, fechaTour:"2020-04-01" }],
  },
  // E45 — Gubernamental
  {
    eCF: "E450000000009", tipoECF: "E45", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    clienteId: "dgii-test-131880681",
    items: [{ codigo:"BLK002", descripcion:"BLOCK", modo:"por_persona", cant:1, pax:20,
              precio:23937.50, descuentoMonto:0, itbis:0.18, fechaTour:"2020-04-01" }],
  },
  // E46 — Exportaciones (con identificador extranjero)
  {
    eCF: "E460000000011", tipoECF: "E46", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    esConsumidorFinal: true, nombreConsumidor: "COMPRADOR EXTRANJERO",
    clienteId: "walk-in", idTransaccion: "56789UJILLL",
    items: [{ codigo:"GOU001", descripcion:"Gouda Import", modo:"por_persona", cant:1, pax:1,
              precio:1086, descuentoMonto:0, itbis:0, fechaTour:"2020-04-01" }],
  },
  // E46 — Exportaciones (con RNC comprador)
  {
    eCF: "E460000000001", tipoECF: "E46", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    clienteId: "dgii-test-131880681",
    items: [{ codigo:"AGU001", descripcion:"AGUACATE CRIOLLO", modo:"por_persona", cant:1, pax:12,
              precio:150000, descuentoMonto:0, itbis:0, fechaTour:"2020-04-01" }],
  },
  // E47 — Pagos al Exterior
  {
    eCF: "E470000000008", tipoECF: "E47", fecha: "2018-12-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    esConsumidorFinal: true, nombreConsumidor: "BENEFICIARIO EXTERIOR",
    clienteId: "walk-in", idTransaccion: "350555123",
    items: [{ codigo:"ASE001", descripcion:"Asesoria Legal P/H", modo:"por_persona", cant:1, pax:1,
              precio:945, descuentoMonto:0, itbis:0, fechaTour:"2018-12-01" }],
  },
  // E47 — Pagos al Exterior
  {
    eCF: "E470000000009", tipoECF: "E47", fecha: "2020-04-01",
    vencimientoECF: "2028-12-31", terminos: "Contado",
    esConsumidorFinal: true, nombreConsumidor: "BENEFICIARIO EXTERIOR",
    clienteId: "walk-in", idTransaccion: "131880681",
    items: [{ codigo:"ASE002", descripcion:"Asesoria Legal P/H", modo:"por_persona", cant:1, pax:20,
              precio:364.50, descuentoMonto:0, itbis:0, fechaTour:"2020-04-01" }],
  },
];

export async function POST(req: NextRequest) {
  try {
    const uid = await verificarSesion(req);
    if (!uid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const batch  = adminDb.batch();
    const creados: string[] = [];

    // 1. Crear/confirmar que existe el cliente de prueba en Firestore
    const clienteRef = adminDb.collection("clientes").doc(CLIENTE_PRUEBA.id);
    batch.set(clienteRef, { ...CLIENTE_PRUEBA, esDePrueba: true }, { merge: true });

    // 2. Crear cada factura en Firestore con el eCF exacto que DGII asignó
    for (const caso of CASOS_PRUEBA) {
      // Verificar si ya existe para no duplicar
      const existente = await adminDb.collection("facturas")
        .where("eCF", "==", caso.eCF).limit(1).get();

      if (!existente.empty) {
        creados.push(`${caso.eCF} (ya existía)`);
        continue;
      }

      const facturaRef = adminDb.collection("facturas").doc();
      const { items, ...resto } = caso;

      batch.set(facturaRef, {
        ...resto,
        noFactura:   caso.eCF,   // número interno = mismo eCF para trazabilidad
        estado:      "pendiente",
        estadoDGII:  "pendiente",
        esDePrueba:  true,        // marcador para distinguirlas en producción
        creadoEn:    FieldValue.serverTimestamp(),
        creadoPor:   uid,
        items: items.map((item) => ({
          ...item,
          fromCatalog:    false,
          tramoLabel:     "",
        })),
      });

      creados.push(caso.eCF);
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      creados: creados.length,
      detalle: creados,
      mensaje: `${creados.length} facturas de prueba listas en Firestore. Ahora envíalas desde la página de Facturas con el botón "Enviar a DGII".`,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[cert/seed]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}