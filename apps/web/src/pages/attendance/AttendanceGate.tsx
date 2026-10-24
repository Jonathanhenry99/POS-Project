import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { Spinner } from '../../components/ui';
import { useMyAttendance } from '../../lib/my-attendance';
import { useApp } from '../../lib/state';

/**
 * Pintu masuk halaman kerja karyawan di HP: selama absensi aktif dan belum absen hari ini, arahkan ke layar absen.
 * Owner dan tablet kasir tidak terkena. Bila status gagal dimuat (mis. sinyal lemah), pekerjaan tidak diblokir.
 */
export function AttendanceGate({ children }: { children: ReactNode }) {
  const applies = useApp((s) => s.mode === 'online' && !s.preview && !!s.user && s.user.role !== 'owner');
  const { data, loading } = useMyAttendance(applies);
  if (!applies) return <>{children}</>;
  if (loading && !data) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }
  if (data?.required && !data.today) return <Navigate to="/absen" replace />;
  return <>{children}</>;
}
