
import { useEffect, useState } from "react";
import { getMenu } from "../services/api";

function MenuList() {
    const [menu, setMenu] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        async function fetchMenu() {
            try {
                const data = await getMenu();
                setMenu(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchMenu();
    }, []);

    if (loading) {
        return <p>Loading menu...</p>;
    }

    if (error) {
        return <p>Error: {error}</p>;
    }

    return (
        <section>
            <h2>Today's Menu</h2>

            <div className="menu-grid">
                {menu.map((item) => (
                    <div className="meal-card" key={item.id}>
                        <h3>{item.name}</h3>

                        <p>
                            ₹{Number(item.price).toFixed(2)}
                            {" / "}
                            {item.unit}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
}

export default MenuList;