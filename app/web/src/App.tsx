import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import { Subnets } from "./pages/Subnets.tsx";
import { Devices } from "./pages/Devices.tsx";
import { DeviceDetail } from "./pages/DeviceDetail.tsx";
import { IpAddresses } from "./pages/IpAddresses.tsx";
import { NetworkMap } from "./pages/NetworkMap.tsx";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="subnets" element={<Subnets />} />
          <Route path="devices" element={<Devices />} />
          <Route path="devices/:id" element={<DeviceDetail />} />
          <Route path="ips" element={<IpAddresses />} />
          <Route path="map" element={<NetworkMap />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
