/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import MiniApp from './MiniApp';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MiniApp />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}
