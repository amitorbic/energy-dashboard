// Translated from: C:\Users\Amit\Desktop\Portal\php_project_1\shared\db_connect - Copy.php
// Translation date: 2026-03-31 12:25
// Module: auth | Type: ui
// ⚠️ VERIFY: Session handling | Database connection setup using SQLAlchemy/asyncpg | Redirect functionality

```tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const DBConnect = () => {
    const router = useRouter();
    const [data, setData] = useState<any>(null);
    
    useEffect(() => {
        // [original PHP] did connect to MySQL database
        fetch('/api/db_connect')
            .then(response => response.json())
            .then(data => setData(data))
            .catch(error => console.error('Error fetching data: ', error));
    }, []);

    return (
        <div className="p-4">
            {data ? <pre>{JSON.stringify(data, null, 2)}</pre> : <p>Loading...</p>}
        </div>
    );
};

export default DBConnect;
```