import React, { createContext, useContext } from "react";
import { useSMSIngestion } from "@/hooks/useSMSIngestion";

type SMSIngestionContextValue = ReturnType<typeof useSMSIngestion>;

const SMSIngestionContext = createContext<SMSIngestionContextValue | null>(null);

export function SMSIngestionProvider({ children }: { children: React.ReactNode }) {
  const value = useSMSIngestion();
  return (
    <SMSIngestionContext.Provider value={value}>
      {children}
    </SMSIngestionContext.Provider>
  );
}

export function useIngestion(): SMSIngestionContextValue {
  const ctx = useContext(SMSIngestionContext);
  if (!ctx) {
    throw new Error("useIngestion must be used within SMSIngestionProvider");
  }
  return ctx;
}
