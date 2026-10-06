import React, { useState, useEffect } from 'react';
import { Printer, CheckCircle, AlertTriangle, Wifi, Monitor, Smartphone, Settings, Zap, Info, RefreshCw } from 'lucide-react';

function PrinterSettings() {
  const [autoPrint, setAutoPrint] = useState(() => localStorage.getItem('mourden_auto_print') !== 'false');
  const [printerType, setPrinterType] = useState(() => localStorage.getItem('mourden_printer_type') || 'system');
  const [testStatus, setTestStatus] = useState(null); // 'printing' | 'success' | 'error'
  const [showKioskGuide, setShowKioskGuide] = useState(false);

  useEffect(() => {
    localStorage.setItem('mourden_auto_print', autoPrint ? 'true' : 'false');
  }, [autoPrint]);

  useEffect(() => {
    localStorage.setItem('mourden_printer_type', printerType);
  }, [printerType]);

  const handleTestPrint = () => {
    setTestStatus('printing');
    try {
      const printWindow = window.open('', '_blank', 'width=400,height=500');
      if (!printWindow) {
        setTestStatus('error');
        return;
      }
      printWindow.document.write(`
        <html><head><title>Test Print - Mourden POS</title>
        <style>
          body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 20px; color: #000; width: 280px; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .big { font-size: 18px; }
          .divider { border-top: 1px dashed #999; margin: 10px 0; }
          .row { display: flex; justify-content: space-between; margin: 3px 0; }
        </style></head><body>
        <div class="center big bold">☕ MOURDEN CAFE</div>
        <div class="center" style="margin-top:4px;">Jl. Contoh No. 123, Jakarta</div>
        <div class="center">Telp: 021-1234567</div>
        <div class="divider"></div>
        <div class="center bold" style="font-size:14px;">🖨️ TEST PRINT</div>
        <div class="center">Printer Connected Successfully!</div>
        <div class="divider"></div>
        <div class="row"><span>Tanggal:</span><span>${new Date().toLocaleDateString('id-ID')}</span></div>
        <div class="row"><span>Waktu:</span><span>${new Date().toLocaleTimeString('id-ID')}</span></div>
        <div class="divider"></div>
        <div class="row"><span>Americano x1</span><span>Rp 25.000</span></div>
        <div class="row"><span>Croissant x2</span><span>Rp 40.000</span></div>
        <div class="divider"></div>
        <div class="row bold"><span>TOTAL</span><span>Rp 65.000</span></div>
        <div class="row"><span>Bayar (Cash)</span><span>Rp 100.000</span></div>
        <div class="row"><span>Kembalian</span><span>Rp 35.000</span></div>
        <div class="divider"></div>
        <div class="center" style="margin-top:8px;">Terima Kasih!</div>
        <div class="center">Selamat Menikmati ☕</div>
        <script>window.onload=function(){window.print();window.close();}</script>
        </body></html>
      `);
      printWindow.document.close();
      setTimeout(() => setTestStatus('success'), 1500);
    } catch (err) {
      setTestStatus('error');
    }
  };

  const cardStyle = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: '16px',
    padding: '28px',
    marginBottom: '20px',
    backdropFilter: 'blur(12px)',
  };

  const toggleStyle = (active) => ({
    width: '56px',
    height: '30px',
    borderRadius: '15px',
    background: active ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.1)',
    border: active ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.2)',
    cursor: 'pointer',
    position: 'relative',
    transition: 'all 0.3s ease',
    flexShrink: 0,
  });

  const toggleDotStyle = (active) => ({
    width: '24px',
    height: '24px',
    borderRadius: '12px',
    background: 'white',
    position: 'absolute',
    top: '2px',
    left: active ? '28px' : '2px',
    transition: 'left 0.3s ease',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  });

  const printerOptionStyle = (selected) => ({
    flex: 1,
    padding: '20px',
    borderRadius: '14px',
    border: selected ? '2px solid #3b82f6' : '2px solid rgba(255,255,255,0.08)',
    background: selected ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    textAlign: 'center',
  });

  return (
    <div className="page-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
          }}>
            <Printer size={24} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>
              Koneksi Printer
            </h1>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
              Pengaturan printer dan cetak struk otomatis
            </p>
          </div>
        </div>
      </div>

      {/* Auto Print Toggle */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: autoPrint ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.3s ease',
            }}>
              <Zap size={22} color={autoPrint ? '#10b981' : 'var(--text-muted)'} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                Auto-Print Saat Checkout
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
                Struk akan otomatis tercetak setelah pembayaran berhasil dikonfirmasi. Tidak perlu menekan tombol cetak manual.
              </div>
            </div>
          </div>
          <div style={toggleStyle(autoPrint)} onClick={() => setAutoPrint(!autoPrint)}>
            <div style={toggleDotStyle(autoPrint)} />
          </div>
        </div>

        {/* Status Badge */}
        <div style={{
          marginTop: '16px',
          padding: '10px 16px',
          borderRadius: '10px',
          background: autoPrint ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
          border: `1px solid ${autoPrint ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          {autoPrint ? (
            <>
              <CheckCircle size={16} color="#10b981" />
              <span style={{ fontSize: '0.9rem', color: '#10b981', fontWeight: 600 }}>
                Auto-print aktif — Struk langsung cetak setelah checkout
              </span>
            </>
          ) : (
            <>
              <AlertTriangle size={16} color="#f59e0b" />
              <span style={{ fontSize: '0.9rem', color: '#f59e0b', fontWeight: 600 }}>
                Auto-print nonaktif — Cetak struk harus manual
              </span>
            </>
          )}
        </div>
      </div>

      {/* Printer Connection Type */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <Settings size={20} color="var(--text-secondary)" />
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
            Tipe Koneksi Printer
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {/* System Dialog */}
          <div style={printerOptionStyle(printerType === 'system')} onClick={() => setPrinterType('system')}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '14px',
              background: printerType === 'system' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px',
              transition: 'all 0.3s ease',
            }}>
              <Monitor size={26} color={printerType === 'system' ? '#3b82f6' : 'var(--text-muted)'} />
            </div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '6px' }}>
              System Dialog
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              Menggunakan dialog print bawaan browser. Pilih printer dari daftar yang tersedia.
            </div>
            {printerType === 'system' && (
              <div style={{
                marginTop: '14px', padding: '6px 14px', borderRadius: '8px',
                background: 'rgba(59,130,246,0.15)', color: '#3b82f6',
                fontSize: '0.8rem', fontWeight: 700, display: 'inline-block',
              }}>
                ✓ Aktif
              </div>
            )}
          </div>

          {/* Kiosk Mode */}
          <div style={printerOptionStyle(printerType === 'kiosk')} onClick={() => setPrinterType('kiosk')}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '14px',
              background: printerType === 'kiosk' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px',
              transition: 'all 0.3s ease',
            }}>
              <Smartphone size={26} color={printerType === 'kiosk' ? '#3b82f6' : 'var(--text-muted)'} />
            </div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '6px' }}>
              Silent Print (Kiosk)
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              Print otomatis tanpa dialog (Chrome Kiosk Mode). Membutuhkan pengaturan khusus.
            </div>
            {printerType === 'kiosk' && (
              <div style={{
                marginTop: '14px', padding: '6px 14px', borderRadius: '8px',
                background: 'rgba(59,130,246,0.15)', color: '#3b82f6',
                fontSize: '0.8rem', fontWeight: 700, display: 'inline-block',
              }}>
                ✓ Aktif
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Test Print */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <Printer size={20} color="var(--text-secondary)" />
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
            Uji Coba Cetak
          </div>
        </div>

        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
          Cetak struk percobaan untuk memastikan printer terhubung dan berfungsi dengan baik.
          Pastikan printer sudah menyala dan terhubung ke perangkat.
        </p>

        <button
          onClick={handleTestPrint}
          disabled={testStatus === 'printing'}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '12px',
            border: 'none',
            background: testStatus === 'success'
              ? 'linear-gradient(135deg, #10b981, #059669)'
              : testStatus === 'error'
              ? 'linear-gradient(135deg, #ef4444, #dc2626)'
              : 'linear-gradient(135deg, #3b82f6, #6366f1)',
            color: 'white',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: testStatus === 'printing' ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
          }}
        >
          {testStatus === 'printing' ? (
            <>
              <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
              Mencetak Struk Uji Coba...
            </>
          ) : testStatus === 'success' ? (
            <>
              <CheckCircle size={18} />
              Berhasil! Printer Terhubung
            </>
          ) : testStatus === 'error' ? (
            <>
              <AlertTriangle size={18} />
              Gagal — Periksa Pop-up Blocker
            </>
          ) : (
            <>
              <Printer size={18} />
              Cetak Struk Uji Coba
            </>
          )}
        </button>

        {testStatus === 'error' && (
          <div style={{
            marginTop: '12px', padding: '12px 16px', borderRadius: '10px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            fontSize: '0.85rem', color: '#ef4444', lineHeight: '1.4',
          }}>
            <strong>Tips:</strong> Pastikan pop-up tidak diblokir oleh browser. Izinkan pop-up untuk halaman ini agar struk bisa dicetak.
          </div>
        )}

        {testStatus === 'success' && (
          <div style={{
            marginTop: '12px', padding: '12px 16px', borderRadius: '10px',
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
            fontSize: '0.85rem', color: '#10b981', lineHeight: '1.4',
          }}>
            Struk uji coba berhasil dikirim ke printer. Periksa printer Anda.
          </div>
        )}
      </div>

      {/* Silent Printing Guide */}
      <div style={cardStyle}>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setShowKioskGuide(!showKioskGuide)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Info size={20} color="var(--text-secondary)" />
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              Panduan Silent Printing (Chrome Kiosk)
            </div>
          </div>
          <div style={{
            transform: showKioskGuide ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s ease',
            color: 'var(--text-secondary)',
          }}>
            ▼
          </div>
        </div>

        {showKioskGuide && (
          <div style={{ marginTop: '20px', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.7' }}>
            <div style={{
              padding: '16px', borderRadius: '12px',
              background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
              marginBottom: '16px',
            }}>
              <strong style={{ color: 'var(--text-primary)' }}>Apa itu Silent Printing?</strong>
              <p style={{ margin: '8px 0 0' }}>
                Silent printing memungkinkan struk langsung tercetak tanpa dialog print muncul di layar.
                Cocok untuk penggunaan di kasir/tablet yang membutuhkan alur cepat tanpa interaksi tambahan.
              </p>
            </div>

            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', fontSize: '1rem' }}>
              Langkah-langkah Setup:
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { step: 1, title: 'Set Default Printer', desc: 'Buka Settings → Printers & Scanners → Set printer thermal sebagai default.' },
                { step: 2, title: 'Buka Chrome dengan Kiosk Flag', desc: 'Jalankan: google-chrome --kiosk --kiosk-printing [URL aplikasi]' },
                { step: 3, title: 'Windows Shortcut', desc: 'Buat shortcut Chrome, tambahkan --kiosk-printing di Target property.' },
                { step: 4, title: 'Android/Tablet', desc: 'Gunakan aplikasi Fully Kiosk Browser dan aktifkan opsi "Auto Print".' },
              ].map(item => (
                <div key={item.step} style={{
                  display: 'flex', gap: '14px', padding: '14px',
                  borderRadius: '10px', background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.85rem', flexShrink: 0,
                  }}>
                    {item.step}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {item.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Connection Status Card */}
      <div style={{
        ...cardStyle,
        background: 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(139,92,246,0.06))',
        border: '1px solid rgba(59,130,246,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <Wifi size={20} color="#3b82f6" />
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
            Status Koneksi
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <div style={{
            padding: '16px', borderRadius: '12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Mode Cetak
            </div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>
              {printerType === 'system' ? '🖥️ System Dialog' : '📱 Kiosk / Silent'}
            </div>
          </div>

          <div style={{
            padding: '16px', borderRadius: '12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Auto-Print
            </div>
            <div style={{ fontWeight: 700, color: autoPrint ? '#10b981' : '#f59e0b', fontSize: '1rem' }}>
              {autoPrint ? '✅ Aktif' : '⚠️ Nonaktif'}
            </div>
          </div>

          <div style={{
            padding: '16px', borderRadius: '12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Test Terakhir
            </div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>
              {testStatus === 'success' ? '✅ Berhasil' : testStatus === 'error' ? '❌ Gagal' : '— Belum ditest'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PrinterSettings;
