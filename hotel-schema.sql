-- Create schema if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'hotel')
BEGIN
    EXEC('CREATE SCHEMA hotel')
END
GO

-- Properties (Hotels)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'hotel.properties') AND type in (N'U'))
CREATE TABLE hotel.properties (
    property_id INT IDENTITY(1,1) PRIMARY KEY,
    property_name NVARCHAR(255) NOT NULL,
    city NVARCHAR(100) NOT NULL,
    state NVARCHAR(100),
    country NVARCHAR(100),
    category NVARCHAR(50), -- star rating
    property_type NVARCHAR(50), -- hotel, resort, etc.
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);
GO

-- Vendors (Rate providers)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'hotel.vendors') AND type in (N'U'))
CREATE TABLE hotel.vendors (
    vendor_id INT IDENTITY(1,1) PRIMARY KEY,
    vendor_name NVARCHAR(255) NOT NULL,
    contact_email NVARCHAR(255),
    contact_phone NVARCHAR(50),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);
GO

-- Room Types
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'hotel.room_types') AND type in (N'U'))
CREATE TABLE hotel.room_types (
    room_type_id INT IDENTITY(1,1) PRIMARY KEY,
    property_id INT FOREIGN KEY REFERENCES hotel.properties(property_id),
    room_name NVARCHAR(255) NOT NULL,
    occupancy_standard INT,
    occupancy_max INT,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);
GO

-- Rate Plans
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'hotel.rate_plans') AND type in (N'U'))
CREATE TABLE hotel.rate_plans (
    rate_plan_id INT IDENTITY(1,1) PRIMARY KEY,
    property_id INT FOREIGN KEY REFERENCES hotel.properties(property_id),
    plan_name NVARCHAR(255) NOT NULL,
    meal_plan NVARCHAR(100), -- BB, HB, FB, AI
    cancellation_policy NVARCHAR(MAX),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);
GO

-- Seasons
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'hotel.seasons') AND type in (N'U'))
CREATE TABLE hotel.seasons (
    season_id INT IDENTITY(1,1) PRIMARY KEY,
    property_id INT FOREIGN KEY REFERENCES hotel.properties(property_id),
    season_name NVARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);
GO

-- Tariffs (Core pricing data)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'hotel.tariffs') AND type in (N'U'))
CREATE TABLE hotel.tariffs (
    tariff_id INT IDENTITY(1,1) PRIMARY KEY,
    property_id INT FOREIGN KEY REFERENCES hotel.properties(property_id),
    vendor_id INT FOREIGN KEY REFERENCES hotel.vendors(vendor_id),
    room_type_id INT FOREIGN KEY REFERENCES hotel.room_types(room_type_id),
    rate_plan_id INT FOREIGN KEY REFERENCES hotel.rate_plans(rate_plan_id),
    season_id INT FOREIGN KEY REFERENCES hotel.seasons(season_id),
    base_rate DECIMAL(10, 2) NOT NULL,
    tax_percent DECIMAL(5, 2),
    service_fee DECIMAL(10, 2),
    currency NVARCHAR(3) DEFAULT 'INR',
    extra_adult_rate DECIMAL(10, 2),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);
GO

-- Documents
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'hotel.documents') AND type in (N'U'))
CREATE TABLE hotel.documents (
    document_id INT IDENTITY(1,1) PRIMARY KEY,
    blob_url NVARCHAR(255) NOT NULL,
    document_type NVARCHAR(50) NOT NULL,
    upload_date DATETIME DEFAULT GETDATE(),
    processed_date DATETIME,
    processing_status NVARCHAR(50) DEFAULT 'pending',
    extracted_text NVARCHAR(MAX),
    tenant_id NVARCHAR(50) NOT NULL
);
GO

-- Flexible attributes for properties (JSON)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'hotel.property_attributes') AND type in (N'U'))
CREATE TABLE hotel.property_attributes (
    property_id INT PRIMARY KEY FOREIGN KEY REFERENCES hotel.properties(property_id),
    attributes NVARCHAR(MAX) -- This will store JSON
);
GO

-- Flexible attributes for tariffs (JSON)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'hotel.tariff_attributes') AND type in (N'U'))
CREATE TABLE hotel.tariff_attributes (
    tariff_id INT PRIMARY KEY FOREIGN KEY REFERENCES hotel.tariffs(tariff_id),
    attributes NVARCHAR(MAX) -- This will store JSON
);
GO

-- Document chunks for RAG
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'hotel.doc_chunks') AND type in (N'U'))
CREATE TABLE hotel.doc_chunks (
    chunk_id INT IDENTITY(1,1) PRIMARY KEY,
    document_id INT FOREIGN KEY REFERENCES hotel.documents(document_id),
    chunk_text NVARCHAR(MAX) NOT NULL,
    chunk_metadata NVARCHAR(MAX) -- This will store JSON
);
GO
