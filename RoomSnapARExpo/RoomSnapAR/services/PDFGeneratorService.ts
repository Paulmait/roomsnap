import { PDFDocument, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { RoomSession } from '../utils/roomStorage';

interface FloorPlanOptions {
  scale: number; // pixels per meter
  showGrid: boolean;
  showDimensions: boolean;
  showFurnitureLabels: boolean;
  showLegend: boolean;
  paperSize: 'A4' | 'Letter' | 'A3';
}

export class PDFGeneratorService {
  private static instance: PDFGeneratorService;

  static getInstance(): PDFGeneratorService {
    if (!PDFGeneratorService.instance) {
      PDFGeneratorService.instance = new PDFGeneratorService();
    }
    return PDFGeneratorService.instance;
  }

  async generateFloorPlan(
    session: RoomSession,
    options: Partial<FloorPlanOptions> = {}
  ): Promise<string> {
    const config: FloorPlanOptions = {
      scale: 20, // 20 pixels per meter
      showGrid: true,
      showDimensions: true,
      showFurnitureLabels: true,
      showLegend: true,
      paperSize: 'A4',
      ...options,
    };

    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Add main floor plan page
      const page = this.addPage(pdfDoc, config.paperSize);
      
      // Draw title
      this.drawTitle(page, session.name, boldFont);
      
      // Draw floor plan
      await this.drawFloorPlan(page, session, config, font);
      
      // Draw furniture
      this.drawFurniture(page, session.boxes, config, font);
      
      // Draw measurements
      if (config.showDimensions && session.measurements.length > 0) {
        this.drawMeasurements(page, session.measurements, config, font);
      }
      
      // Draw grid
      if (config.showGrid) {
        this.drawGrid(page, config);
      }
      
      // Draw legend
      if (config.showLegend) {
        this.drawLegend(page, session, font);
      }
      
      // Add metadata page
      const metadataPage = this.addPage(pdfDoc, config.paperSize);
      this.drawMetadata(metadataPage, session, font, boldFont);
      
      // Add notes page if there are notes
      if (session.notes) {
        const notesPage = this.addPage(pdfDoc, config.paperSize);
        this.drawNotes(notesPage, session.notes, font, boldFont);
      }

      // Save PDF
      const pdfBytes = await pdfDoc.save();
      const fileName = `floorplan_${session.name.replace(/\s/g, '_')}_${Date.now()}.pdf`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;
      
      await FileSystem.writeAsStringAsync(filePath, this.uint8ArrayToBase64(pdfBytes), {
        encoding: FileSystem.EncodingType.Base64,
      });

      return filePath;
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      throw error;
    }
  }

  private addPage(pdfDoc: PDFDocument, paperSize: 'A4' | 'Letter' | 'A3'): PDFPage {
    const sizes = {
      A4: { width: 595, height: 842 },
      Letter: { width: 612, height: 792 },
      A3: { width: 842, height: 1191 },
    };
    
    const size = sizes[paperSize];
    return pdfDoc.addPage([size.width, size.height]);
  }

  private drawTitle(page: PDFPage, title: string, font: any): void {
    const { height } = page.getSize();
    page.drawText(title, {
      x: 50,
      y: height - 50,
      size: 24,
      font,
      color: rgb(0, 0, 0),
    });
    
    // Add timestamp
    const date = new Date().toLocaleDateString();
    page.drawText(date, {
      x: 50,
      y: height - 75,
      size: 12,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  private async drawFloorPlan(
    page: PDFPage,
    session: RoomSession,
    config: FloorPlanOptions,
    font: any
  ): Promise<void> {
    const { width, height } = page.getSize();
    const planArea = {
      x: 50,
      y: 150,
      width: width - 100,
      height: height - 300,
    };

    // Draw room outline
    page.drawRectangle({
      x: planArea.x,
      y: planArea.y,
      width: planArea.width,
      height: planArea.height,
      borderColor: rgb(0, 0, 0),
      borderWidth: 2,
    });

    // Calculate room dimensions from measurements
    if (session.measurements.length > 0) {
      const avgDistance = session.measurements.reduce((sum, m) => sum + m.distance, 0) / session.measurements.length;
      const roomWidth = Math.min(avgDistance * 2, planArea.width - 40);
      const roomHeight = roomWidth * 0.75; // Assume 4:3 ratio

      // Draw inner room
      page.drawRectangle({
        x: planArea.x + 20,
        y: planArea.y + 20,
        width: roomWidth,
        height: roomHeight,
        borderColor: rgb(0.2, 0.2, 0.2),
        borderWidth: 1,
        color: rgb(0.98, 0.98, 0.98),
      });

      // Add room dimensions
      if (config.showDimensions) {
        const widthInM = (roomWidth / config.scale).toFixed(1);
        const heightInM = (roomHeight / config.scale).toFixed(1);
        
        page.drawText(`${widthInM}m`, {
          x: planArea.x + roomWidth / 2 - 15,
          y: planArea.y + 5,
          size: 10,
          font,
          color: rgb(0, 0, 0),
        });
        
        page.drawText(`${heightInM}m`, {
          x: planArea.x + 5,
          y: planArea.y + roomHeight / 2,
          size: 10,
          font,
          color: rgb(0, 0, 0),
          rotate: { angle: 90, type: 1 as any },
        });
      }
    }
  }

  private drawFurniture(
    page: PDFPage,
    boxes: RoomSession['boxes'],
    config: FloorPlanOptions,
    font: any
  ): void {
    const planArea = {
      x: 50,
      y: 150,
      width: page.getSize().width - 100,
      height: page.getSize().height - 300,
    };

    boxes.forEach((box, index) => {
      const x = planArea.x + 40 + (box.position[0] + 2) * 50;
      const y = planArea.y + 40 + (box.position[1] + 2) * 50;
      const width = box.size[0] / 4;
      const height = box.size[2] / 4;

      // Draw furniture rectangle
      page.drawRectangle({
        x,
        y,
        width,
        height,
        color: this.hexToRgb(box.color),
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
        opacity: 0.7,
      });

      // Add furniture label
      if (config.showFurnitureLabels) {
        page.drawText(box.label, {
          x: x + 5,
          y: y + height / 2 - 4,
          size: 8,
          font,
          color: rgb(0, 0, 0),
        });
      }
    });
  }

  private drawMeasurements(
    page: PDFPage,
    measurements: RoomSession['measurements'],
    config: FloorPlanOptions,
    font: any
  ): void {
    const planArea = {
      x: 50,
      y: 150,
    };

    measurements.forEach((measurement, index) => {
      if (measurement.points.length === 2) {
        const p1 = {
          x: planArea.x + 40 + measurement.points[0].x * config.scale,
          y: planArea.y + 40 + measurement.points[0].y * config.scale,
        };
        const p2 = {
          x: planArea.x + 40 + measurement.points[1].x * config.scale,
          y: planArea.y + 40 + measurement.points[1].y * config.scale,
        };

        // Draw measurement line
        page.drawLine({
          start: p1,
          end: p2,
          color: rgb(0.2, 0.4, 0.8),
          thickness: 1,
        });

        // Draw endpoints
        [p1, p2].forEach(point => {
          page.drawCircle({
            x: point.x,
            y: point.y,
            size: 3,
            color: rgb(0.2, 0.4, 0.8),
          });
        });

        // Add distance label
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const distanceText = measurement.unit === 'metric' 
          ? `${(measurement.distance / 100).toFixed(2)}m`
          : `${(measurement.distance / 30.48).toFixed(1)}ft`;

        page.drawText(distanceText, {
          x: midX - 15,
          y: midY + 5,
          size: 9,
          font,
          color: rgb(0.2, 0.4, 0.8),
        });
      }
    });
  }

  private drawGrid(page: PDFPage, config: FloorPlanOptions): void {
    const { width, height } = page.getSize();
    const gridSpacing = config.scale; // 1 meter grid
    const planArea = {
      x: 50,
      y: 150,
      width: width - 100,
      height: height - 300,
    };

    // Vertical lines
    for (let x = planArea.x; x <= planArea.x + planArea.width; x += gridSpacing) {
      page.drawLine({
        start: { x, y: planArea.y },
        end: { x, y: planArea.y + planArea.height },
        color: rgb(0.9, 0.9, 0.9),
        thickness: 0.5,
      });
    }

    // Horizontal lines
    for (let y = planArea.y; y <= planArea.y + planArea.height; y += gridSpacing) {
      page.drawLine({
        start: { x: planArea.x, y },
        end: { x: planArea.x + planArea.width, y },
        color: rgb(0.9, 0.9, 0.9),
        thickness: 0.5,
      });
    }
  }

  private drawLegend(page: PDFPage, session: RoomSession, font: any): void {
    const legendX = page.getSize().width - 150;
    const legendY = page.getSize().height - 150;
    
    page.drawText('Legend', {
      x: legendX,
      y: legendY,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });

    const furnitureTypes = [...new Set(session.boxes.map(b => b.label))];
    furnitureTypes.forEach((type, index) => {
      const box = session.boxes.find(b => b.label === type);
      if (box) {
        // Draw color box
        page.drawRectangle({
          x: legendX,
          y: legendY - 20 - (index * 20),
          width: 15,
          height: 15,
          color: this.hexToRgb(box.color),
          borderColor: rgb(0, 0, 0),
          borderWidth: 0.5,
        });
        
        // Draw label
        page.drawText(type, {
          x: legendX + 20,
          y: legendY - 17 - (index * 20),
          size: 10,
          font,
          color: rgb(0, 0, 0),
        });
      }
    });
  }

  private drawMetadata(
    page: PDFPage,
    session: RoomSession,
    font: any,
    boldFont: any
  ): void {
    const { height } = page.getSize();
    let yPosition = height - 80;

    page.drawText('Project Details', {
      x: 50,
      y: yPosition,
      size: 18,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    const details = [
      { label: 'Session Name:', value: session.name },
      { label: 'Created:', value: new Date(session.createdAt).toLocaleString() },
      { label: 'Last Modified:', value: new Date(session.updatedAt).toLocaleString() },
      { label: 'Total Measurements:', value: session.measurements.length.toString() },
      { label: 'Total Objects:', value: session.boxes.length.toString() },
      { label: 'Floor Area:', value: this.calculateFloorArea(session) },
      { label: 'Estimated Cost:', value: this.calculateEstimatedCost(session) },
    ];

    details.forEach((detail, index) => {
      yPosition -= 30;
      page.drawText(detail.label, {
        x: 50,
        y: yPosition,
        size: 11,
        font: boldFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      page.drawText(detail.value, {
        x: 180,
        y: yPosition,
        size: 11,
        font,
        color: rgb(0, 0, 0),
      });
    });
  }

  private drawNotes(page: PDFPage, notes: string, font: any, boldFont: any): void {
    const { height } = page.getSize();
    
    page.drawText('Notes', {
      x: 50,
      y: height - 80,
      size: 18,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    // Word wrap notes
    const lines = this.wrapText(notes, 80);
    lines.forEach((line, index) => {
      page.drawText(line, {
        x: 50,
        y: height - 120 - (index * 15),
        size: 11,
        font,
        color: rgb(0, 0, 0),
      });
    });
  }

  private calculateFloorArea(session: RoomSession): string {
    if (session.measurements.length === 0) return 'N/A';
    
    const avgDistance = session.measurements.reduce((sum, m) => sum + m.distance, 0) / session.measurements.length;
    const estimatedArea = Math.pow(avgDistance / 100, 2) * 1.5; // Rough estimate
    return `~${estimatedArea.toFixed(1)} m²`;
  }

  private calculateEstimatedCost(session: RoomSession): string {
    // Basic furniture cost estimation
    const costs: { [key: string]: number } = {
      'Sofa': 800,
      'Bed': 600,
      'Table': 400,
      'Chair': 150,
      'Desk': 350,
      'Wardrobe': 500,
      'TV Stand': 250,
      'Bookshelf': 200,
    };

    const total = session.boxes.reduce((sum, box) => {
      return sum + (costs[box.label] || 200);
    }, 0);

    return `$${total.toLocaleString()} (estimate)`;
  }

  private hexToRgb(hex: string): any {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? rgb(
          parseInt(result[1], 16) / 255,
          parseInt(result[2], 16) / 255,
          parseInt(result[3], 16) / 255
        )
      : rgb(0.5, 0.5, 0.5);
  }

  private wrapText(text: string, maxChars: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach(word => {
      if ((currentLine + word).length < maxChars) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach(byte => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  async sharePDF(filePath: string): Promise<void> {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share Floor Plan',
      });
    }
  }
}