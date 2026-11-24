import React from 'react';

// Display the current online-user collection supplied by the parent component.
function Sidebar({ users }) {
  return (
    <div className="sidebar">
      <h2>Online Users</h2>
      <ul className="users-list">
        {users.map((user, idx) => (
          <li key={idx} className="user-item">
            <span className="user-status">●</span>
            {user.name || user.id}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Sidebar;
