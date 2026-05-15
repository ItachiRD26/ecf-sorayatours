"use client";

import { useState, useEffect } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Servicio } from "@/types";

function cleanData(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function useServicios() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "servicios"), orderBy("nombre", "asc"));
    const unsub = onSnapshot(q,
      (snap) => {
        setServicios(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Servicio)));
        setLoading(false);
      },
      (err) => {
        console.error("[useServicios]", err);
        setError("Error cargando servicios");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const agregar = async (data: Omit<Servicio, "id">) => {
    const ref = await addDoc(collection(db, "servicios"),
      cleanData({ ...data, creadoEn: serverTimestamp() })
    );
    return ref.id;
  };

  const actualizar = async (id: string, data: Partial<Servicio>) => {
    await updateDoc(doc(db, "servicios", id),
      cleanData({ ...data, actualizadoEn: serverTimestamp() })
    );
  };

  const eliminar = async (id: string) => {
    await deleteDoc(doc(db, "servicios", id));
  };

  return { servicios, loading, error, agregar, actualizar, eliminar };
}