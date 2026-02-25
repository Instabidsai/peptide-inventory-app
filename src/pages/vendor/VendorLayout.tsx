import { Outlet } from 'react-router-dom';

export default function VendorLayout() {
    return (
        <div className="space-y-6">
            <Outlet />
        </div>
    );
}
