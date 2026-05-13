# Lumiere Inventory System

Lumiere Inventory System is a full-stack warehouse and supply management app built for tracking products, suppliers, warehouses, personnel, and stock transfers.

It includes:
- Product inventory across multiple warehouses
- Order logs for inbound and outbound stock movement
- Supplier and warehouse management
- Role-based access for Super Admin, Manager, and Staff
- Reports for stock totals and inventory value

## Tech Stack

- Frontend: React, Vite, Tailwind-style utility classes
- Backend: Node.js, Express, Mongoose
- Database: MongoDB

## Project Structure

```text
Inventory System/
|-- backend/
|   |-- controllers/
|   |-- models/
|   |-- routes/
|   |-- utils/
|   `-- server.js
`-- frontend/
    |-- src/
    `-- vite.config.js
```

## Main Features

### Inventory
- View all registered products
- Track stock per warehouse
- Monitor low-stock products
- Group products by category

### Orders
- Create inbound restock transfers
- Create outbound sales transfers
- Record who created each order
- Mark orders as delivered or cancelled
- Prevent outbound orders from exceeding available stock

### Supplier Hub
- Manage suppliers
- Manage warehouse directory
- Keep warehouse data in MongoDB instead of hardcoded UI values

### Reports
- Total inventory value
- Critical stock alerts
- Warehouse total stock summaries
- Financial breakdown by product

### Personnel and Permissions
- `SuperAdmin` can manage products, suppliers, warehouses, managers, and staff
- `Manager` can manage staff they created
- `Staff` can view Inventory and Order Logs only

## Warehouse Seed Data

The backend also seeds these warehouse records:

- `Warehouse A` - `Pope John Paul II Avenue, Cebu City, Cebu`
- `Warehouse B` - `N. Bacalso Avenue, Cebu City, Cebu`

## Environment Variables

Create `backend/.env` with:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
```

## Installation

### 1. Install backend dependencies

```powershell
cd "backend"
npm install
```

### 2. Install frontend dependencies

```powershell
cd frontend
npm install
```

## Running the Project

Open two terminals.

### Backend

```powershell
cd backend
npm run dev
```

### Frontend

```powershell
cd frontend
npm run dev
```

Then open the Vite URL, usually:

- [http://localhost:5173](http://localhost:5173)

## API Notes

- Frontend defaults to `http://localhost:5000/api`
- Orders, users, and protected management actions require authentication
- Supplier for stock transfers is pulled automatically from the selected product registration

## Role Behavior Summary

### Super Admin
- Full access
- Can edit own profile
- Can create managers and staff
- Can manage products, suppliers, and warehouses

### Manager
- Can edit own profile
- Can create staff
- Can edit only staff accounts they created
- Can create and process orders

### Staff
- Can view `Inventory`
- Can view `Order Logs`
- Cannot create orders
- Cannot access supplier hub, reports, or personnel management

## Build Frontend

```powershell
cd frontend
npm run build
```

## Repository

GitHub:

- [angelooodev/inventory-supply-chain](https://github.com/angelooodev/inventory-supply-chain)
