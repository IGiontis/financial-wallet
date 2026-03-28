import { useUser } from "../../../shared/hooks/useUser";

export function SettingsPage() {
  const { data: user } = useUser();

  return (
    <div>
      <h2 className="mb-4">Settings</h2>
      <div className="card">
        <div className="card-header">
          <h5 className="mb-0">Profile Information</h5>
        </div>
        <div className="card-body">
          <div className="mb-3">
            <label className="form-label">Email</label>
            <input type="email" className="form-control" value={user?.email} readOnly />
          </div>
          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label">First Name</label>
              <input type="text" className="form-control" value={user?.firstName} readOnly />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">Last Name</label>
              <input type="text" className="form-control" value={user?.lastName} readOnly />
            </div>
          </div>
          <button className="btn btn-primary">Save Changes</button>
        </div>
      </div>
    </div>
  );
}
