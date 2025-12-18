import React, { useRef, useState } from 'react';
import { View, Button, StyleSheet, Alert, Text, ActivityIndicator } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { PDFDocument, rgb } from 'pdf-lib';

export default function ExportPlanScreen() {
  const arViewRef = useRef<View>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCapture = async () => {
    try {
      setIsProcessing(true);
      if (!arViewRef.current) {
        Alert.alert('Error', 'No view to capture');
        return;
      }
      const uri = await captureRef(arViewRef, {
        format: 'png',
        quality: 1,
      });
      // Save locally with timestamp
      const timestamp = Date.now();
      const fileUri = `${FileSystem.documentDirectory}ar-capture-${timestamp}.png`;
      await FileSystem.copyAsync({ from: uri, to: fileUri });
      setCapturedUri(fileUri);
      Alert.alert('Success', 'Image captured successfully!');
    } catch (error) {
      console.error('Capture error:', error);
      Alert.alert('Error', 'Failed to capture AR view.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      setIsProcessing(true);
      if (!arViewRef.current) {
        Alert.alert('Error', 'No content to export');
        return;
      }
      
      const uri = await captureRef(arViewRef, {
        format: 'png',
        quality: 1,
      });
      
      const imageBytes = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([600, 800]);
      
      // Add title
      page.drawText('AR Room Plan Export', {
        x: 50,
        y: 750,
        size: 20,
        color: rgb(0, 0, 0),
      });
      
      // Add date
      page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
        x: 50,
        y: 720,
        size: 12,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      // Embed the image
      const pngImage = await pdfDoc.embedPng(`data:image/png;base64,${imageBytes}`);
      const aspectRatio = pngImage.width / pngImage.height;
      const maxWidth = 500;
      const maxHeight = 375;
      let drawWidth = maxWidth;
      let drawHeight = maxWidth / aspectRatio;
      
      if (drawHeight > maxHeight) {
        drawHeight = maxHeight;
        drawWidth = maxHeight * aspectRatio;
      }
      
      page.drawImage(pngImage, {
        x: 50,
        y: 300,
        width: drawWidth,
        height: drawHeight,
      });
      
      const pdfBytes = await pdfDoc.save();
      const timestamp = Date.now();
      const pdfUri = `${FileSystem.documentDirectory}ar-capture-${timestamp}.pdf`;
      
      // Write the PDF file
      const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
      await FileSystem.writeAsStringAsync(pdfUri, pdfBase64, { encoding: FileSystem.EncodingType.Base64 });
      
      // Share the PDF
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Export AR Plan as PDF',
        });
      } else {
        Alert.alert('Success', 'PDF saved locally!');
      }
    } catch (error) {
      console.error('PDF export error:', error);
      Alert.alert('Error', 'Failed to export PDF. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleShare = async () => {
    try {
      setIsProcessing(true);
      
      // Use existing capture or create new one
      let fileUri = capturedUri;
      
      if (!fileUri) {
        // Capture first if not already done
        if (!arViewRef.current) {
          Alert.alert('Error', 'No content to share');
          return;
        }
        const uri = await captureRef(arViewRef, {
          format: 'png',
          quality: 1,
        });
        const timestamp = Date.now();
        fileUri = `${FileSystem.documentDirectory}ar-capture-${timestamp}.png`;
        await FileSystem.copyAsync({ from: uri, to: fileUri });
        setCapturedUri(fileUri);
      }
      
      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        Alert.alert('Error', 'File not found. Please capture first.');
        return;
      }
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'image/png',
          dialogTitle: 'Share AR Capture',
        });
      } else {
        Alert.alert('Sharing not available', 'Sharing is not available on this device');
      }
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('Error', 'Failed to share file. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View ref={arViewRef} style={styles.arView}>
        <Text style={styles.placeholderText}>AR Room View</Text>
        <Text style={styles.infoText}>Room dimensions and objects will appear here</Text>
      </View>
      
      {isProcessing && (
        <ActivityIndicator size="large" color="#2196F3" style={styles.loader} />
      )}
      
      <View style={styles.buttonContainer}>
        <Button 
          title={isProcessing ? "Processing..." : "Capture AR View"} 
          onPress={handleCapture} 
          disabled={isProcessing}
        />
        <Button 
          title={isProcessing ? "Processing..." : "Export as PDF"} 
          onPress={handleExportPDF} 
          disabled={isProcessing}
        />
        <Button 
          title={isProcessing ? "Processing..." : "Share Image"} 
          onPress={handleShare} 
          disabled={isProcessing}
        />
      </View>
      
      {capturedUri && !isProcessing && (
        <Text style={styles.statusText}>✓ Image captured and ready to share</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  arView: {
    width: '100%',
    height: 400,
    backgroundColor: '#f0f0f0',
    marginBottom: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  placeholderText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
  },
  buttonContainer: {
    width: '100%',
    gap: 10,
  },
  statusText: {
    marginTop: 15,
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '500',
  },
  loader: {
    position: 'absolute',
    top: '50%',
  },
});