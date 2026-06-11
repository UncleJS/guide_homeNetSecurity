import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import { Subnets } from "./pages/Subnets.tsx";
import { SubnetDetail } from "./pages/SubnetDetail.tsx";
import { Devices } from "./pages/Devices.tsx";
import { DeviceDetail } from "./pages/DeviceDetail.tsx";
import { IpAddresses } from "./pages/IpAddresses.tsx";
import { NetworkMap } from "./pages/NetworkMap.tsx";
import { Schedules } from "./pages/Schedules.tsx";
import { ScheduleDetail } from "./pages/ScheduleDetail.tsx";
import { ScanRunDetail } from "./pages/ScanRunDetail.tsx";
import { Calendar } from "./pages/Calendar.tsx";
import { Notes } from "./pages/Notes.tsx";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="subnets" element={<Subnets />} />
          <Route path="subnets/:id" element={<SubnetDetail />} />
          <Route path="devices" element={<Devices />} />
          <Route path="devices/:id" element={<DeviceDetail />} />
          <Route path="ips" element={<IpAddresses />} />
          <Route path="map" element={<NetworkMap />} />
          <Route path="schedules" element={<Schedules />} />
          <Route path="schedules/:id" element={<ScheduleDetail />} />
          <Route path="runs/:id" element={<ScanRunDetail />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="notes" element={<Notes />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
