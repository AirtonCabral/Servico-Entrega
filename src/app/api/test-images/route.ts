import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

export async function GET() {
  try {
    const artifactsDir = join(process.cwd(), "artifacts");
    const fs = await import("fs/promises");
    
    // Ler todos os arquivos PNG da pasta artifacts
    const files = await fs.readdir(artifactsDir);
    const imageFiles = files.filter(f => f.endsWith('.png')).sort();
    
    const images = await Promise.all(
      imageFiles.map(async (filename) => {
        const filePath = join(artifactsDir, filename);
        const buffer = await fs.readFile(filePath);
        const base64 = buffer.toString('base64');
        return {
          filename,
          url: `data:image/png;base64,${base64}`,
          size: buffer.length
        };
      })
    );
    
    return NextResponse.json({ 
      success: true, 
      images,
      count: images.length 
    });
  } catch (error) {
    console.error("Erro ao ler imagens de teste:", error);
    return NextResponse.json(
      { success: false, error: "Não foi possível ler as imagens de teste" },
      { status: 500 }
    );
  }
}
