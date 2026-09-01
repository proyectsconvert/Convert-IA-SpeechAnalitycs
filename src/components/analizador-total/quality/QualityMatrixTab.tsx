import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, BarChart3 } from "lucide-react";
import { QualityMatrixEditor } from "./QualityMatrixEditor";
import { QualityMatrixAnalysis } from "./QualityMatrixAnalysis";
import type { AnalizadorUnifiedRow } from "@/components/analizador-total/types";

interface Props {
  rawData?: AnalizadorUnifiedRow[];
}

export function QualityMatrixTab({ rawData }: Props) {
  return (
    <Tabs defaultValue="analysis" className="space-y-4">
      <TabsList className="bg-muted/50">
        <TabsTrigger value="analysis" className="text-xs"><BarChart3 className="w-3.5 h-3.5 mr-1.5" />Análisis Matriz de Calidad</TabsTrigger>
        <TabsTrigger value="editor" className="text-xs"><Settings className="w-3.5 h-3.5 mr-1.5" />Edición Matriz de Calidad</TabsTrigger>
      </TabsList>
      <TabsContent value="analysis"><QualityMatrixAnalysis rawData={rawData} /></TabsContent>
      <TabsContent value="editor"><QualityMatrixEditor /></TabsContent>
    </Tabs>
  );
}
