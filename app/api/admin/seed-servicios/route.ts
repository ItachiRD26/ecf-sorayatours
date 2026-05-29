// Seed de catálogo de servicios — 9 tours de Soraya y Leonardo Tours
// POST /api/admin/seed-servicios
// Crea o actualiza los 9 tours con precios correctos (1 USD = RD$59)
// Los precios siguen la lógica de getPrice(adults) del sitio web.

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb }        from "@/lib/firebase-admin";
import type { PriceTier }            from "@/types";

async function verificarSesion(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return false;
  try { await adminAuth.verifySessionCookie(cookie); return true; }
  catch { return false; }
}

// 1 USD = RD$59, redondeado a entero
const R = (usd: number) => Math.round(usd * 59);

const SERVICIOS: {
  codigo:       string;
  nombre:       string;
  descripcion:  string;
  tiers:        PriceTier[];
  itbis:        number;
}[] = [
  {
    codigo:      "TOUR-GG",
    nombre:      "Banco de Arenas Gran Grossier",
    descripcion: "Excursión al famoso banco de arenas Gran Grossier. Precio total por grupo.",
    tiers: [
      { upTo: 2,    total: R(140)  },              // $140 plano
      { upTo: 4,    total: R(150)  },              // $150 plano
      { upTo: 6,    total: R(170)  },              // $170 plano
      { upTo: 29,   total: R(170), incr: R(23) },  // $170 + $23/persona extra sobre 6
      { upTo: 9999, total: R(20),  perPax: true }, // $20/persona para 30+
    ],
    itbis: 0.18,
  },
  {
    codigo:      "TOUR-IC",
    nombre:      "Isla Cabra",
    descripcion: "Tour a Isla Cabra. Precio total por grupo.",
    tiers: [
      { upTo: 4,    total: R(60)  },               // $60 plano
      { upTo: 8,    total: R(70)  },               // $70 plano
      { upTo: 9,    total: R(70),  incr: R(8) },   // $70 + $8 por persona sobre 8
      { upTo: 9999, total: R(7),   perPax: true }, // $7/persona para 10+
    ],
    itbis: 0.18,
  },
  {
    codigo:      "TOUR-C7",
    nombre:      "Cayos 7 Hermanos",
    descripcion: "Excursión a los Cayos 7 Hermanos. Solo horario de mañana.",
    tiers: [
      { upTo: 4,    total: R(200)  },              // $200 plano
      { upTo: 19,   total: R(200), incr: R(50) },  // $200 + $50/persona sobre 4
      { upTo: 9999, total: R(45),  perPax: true }, // $45/persona para 20+
    ],
    itbis: 0.18,
  },
  {
    codigo:      "TOUR-PE",
    nombre:      "Plataforma Ecoturística",
    descripcion: "Visita a la Plataforma Ecoturística de Montecristi.",
    tiers: [
      { upTo: 4,    total: R(100)  },              // $100 plano
      { upTo: 8,    total: R(130)  },              // $130 plano
      { upTo: 19,   total: R(130), incr: R(15) },  // $130 + $15/persona sobre 8
      { upTo: 9999, total: R(12),  perPax: true }, // $12/persona para 20+
    ],
    itbis: 0.18,
  },
  {
    codigo:      "TOUR-PN",
    nombre:      "Piscina Natural",
    descripcion: "Tour a la Piscina Natural. Precio escala linealmente con el grupo.",
    tiers: [
      { upTo: 4,    total: R(130)  },              // $130 plano
      { upTo: 9,    total: R(150)  },              // $150 plano
      { upTo: 9999, total: R(150), incr: R(15) },  // $150 + $15/persona sobre 9 (sin tope)
    ],
    itbis: 0.18,
  },
  {
    codigo:      "TOUR-PD",
    nombre:      "Pesca Deportiva",
    descripcion: "Pesca deportiva en el mar. Máximo 4 personas recomendado.",
    tiers: [
      { upTo: 2,    total: R(220) },               // $220 plano
      { upTo: 3,    total: R(320) },               // $320 plano
      { upTo: 5,    total: R(420) },               // $420 plano
      { upTo: 9999, total: R(100), perPax: true }, // $100/persona para 6+
    ],
    itbis: 0.18,
  },
  {
    codigo:      "TOUR-SN",
    nombre:      "Aventura de Snorkeling",
    descripcion: "Snorkeling en aguas cristalinas. Precio escala con grupo.",
    tiers: [
      { upTo: 2,    total: R(130)  },              // $130 plano
      { upTo: 3,    total: R(140)  },              // $140 plano
      { upTo: 5,    total: R(150)  },              // $150 plano
      { upTo: 9999, total: R(150), incr: R(30) },  // $150 + $30/persona sobre 5 (sin tope)
    ],
    itbis: 0.18,
  },
  {
    codigo:      "TOUR-AA",
    nombre:      "Avistamiento de Aves",
    descripcion: "Tour de avistamiento de aves. Horarios especiales de madrugada y tarde.",
    tiers: [
      { upTo: 4,    total: R(100)  },              // $100 plano
      { upTo: 8,    total: R(175)  },              // $175 plano
      { upTo: 9999, total: R(20),  perPax: true }, // $20/persona para 9+
    ],
    itbis: 0.18,
  },
  {
    codigo:      "TOUR-CT",
    nombre:      "Excursión en la Ciudad",
    descripcion: "City tour por Montecristi y sus alrededores.",
    tiers: [
      { upTo: 10,   total: R(70)   },              // $70 plano
      { upTo: 20,   total: R(100)  },              // $100 plano
      { upTo: 50,   total: R(150)  },              // $150 plano
      { upTo: 9999, total: R(10),  perPax: true }, // $10/persona para 51+
    ],
    itbis: 0.18,
  },
];

export async function POST(req: NextRequest) {
  if (!await verificarSesion(req))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const resultados: { codigo: string; accion: string }[] = [];
  const batch = adminDb.batch();

  for (const s of SERVICIOS) {
    // Buscar si ya existe por código
    const existing = await adminDb.collection("servicios")
      .where("codigo", "==", s.codigo).limit(1).get();

    const data = {
      codigo:      s.codigo,
      nombre:      s.nombre,
      descripcion: s.descripcion,
      modalidad:   "por_grupo",
      tiers:       s.tiers,
      itbis:       s.itbis,
      activo:      true,
      // Mantener campos legacy con valor 0 para compatibilidad
      precioTramo1_2:   s.tiers[0]?.total ?? 0,
      precioTramo3_5:   s.tiers[1]?.total ?? s.tiers[0]?.total ?? 0,
      precioTramo6_8:   s.tiers[2]?.total ?? s.tiers[1]?.total ?? 0,
      precioPorPersona: s.tiers.find(t => t.perPax)?.total ?? 0,
    };

    if (!existing.empty) {
      batch.update(existing.docs[0].ref, data);
      resultados.push({ codigo: s.codigo, accion: "actualizado" });
    } else {
      const ref = adminDb.collection("servicios").doc();
      batch.set(ref, { ...data, creadoEn: new Date().toISOString() });
      resultados.push({ codigo: s.codigo, accion: "creado" });
    }
  }

  await batch.commit();
  return NextResponse.json({ success: true, total: SERVICIOS.length, resultados });
}
