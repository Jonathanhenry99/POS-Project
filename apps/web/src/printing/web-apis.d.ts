// Deklarasi minimal Web Serial & WebUSB (belum ada di lib.dom TypeScript).

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readonly writable: WritableStream<Uint8Array> | null;
  getInfo(): { bluetoothServiceClassId?: string; usbVendorId?: number; usbProductId?: number };
}

interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>;
  requestPort(options?: {
    filters?: { bluetoothServiceClassId?: string; usbVendorId?: number }[];
    allowedBluetoothServiceClassIds?: string[];
  }): Promise<SerialPortLike>;
}

interface USBEndpointLike {
  endpointNumber: number;
  direction: 'in' | 'out';
  type: 'bulk' | 'interrupt' | 'isochronous';
}

interface USBAlternateLike {
  interfaceClass: number;
  endpoints: USBEndpointLike[];
}

interface USBInterfaceLike {
  interfaceNumber: number;
  claimed: boolean;
  alternates: USBAlternateLike[];
}

interface USBDeviceLike {
  productName?: string;
  manufacturerName?: string;
  opened: boolean;
  configuration: { interfaces: USBInterfaceLike[] } | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(value: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  releaseInterface(n: number): Promise<void>;
  transferOut(endpoint: number, data: BufferSource): Promise<{ status: 'ok' | 'stall' | 'babble'; bytesWritten: number }>;
}

interface USBLike {
  getDevices(): Promise<USBDeviceLike[]>;
  requestDevice(options: { filters: { classCode?: number; vendorId?: number }[] }): Promise<USBDeviceLike>;
}

interface Navigator {
  readonly serial?: SerialLike;
  readonly usb?: USBLike;
}
