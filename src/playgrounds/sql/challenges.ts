// Ten progressively harder SQL challenges for the playground page. Solutions are used only by "Check answer".
import { auditLogRows } from './datasets';

export interface SqlChallenge {
  id: string;
  dataset: 'shop' | 'hr' | 'audit';
  level: 'beginner' | 'intermediate' | 'advanced';
  topic: string;
  title: string;
  prompt: string;
  hints: string[];
  solutionSql: string;
  ordered?: boolean;
}

const cursor = auditLogRows().find((r) => r.id === 20)!;

export const SQL_CHALLENGES: SqlChallenge[] = [
  {
    id: 'sql-01-cheap-products', dataset: 'shop', level: 'beginner', topic: 'SELECT, WHERE, ORDER BY',
    title: 'Products under ₹1,000',
    prompt: 'List the `name` and `price` of every product that costs less than 1000, cheapest first. When two products cost the same, sort them by name.',
    hints: ['Filter rows with WHERE price < 1000.', 'ORDER BY can take several columns: ORDER BY price, name.'],
    solutionSql: 'SELECT name, price FROM products WHERE price < 1000 ORDER BY price, name;',
    ordered: true,
  },
  {
    id: 'sql-02-recent-orders', dataset: 'shop', level: 'beginner', topic: 'ORDER BY … DESC, LIMIT',
    title: 'Five latest live orders',
    prompt: 'Show the `id`, `order_date` and `status` of the 5 most recent orders that are **not** cancelled. Newest first; break ties on the higher id first.',
    hints: ['Exclude a value with status <> \'cancelled\'.', 'Sort with ORDER BY order_date DESC, id DESC and keep the first rows with LIMIT 5.'],
    solutionSql: "SELECT id, order_date, status FROM orders WHERE status <> 'cancelled' ORDER BY order_date DESC, id DESC LIMIT 5;",
    ordered: true,
  },
  {
    id: 'sql-03-pune-orders', dataset: 'shop', level: 'beginner', topic: 'INNER JOIN',
    title: 'Orders placed from Pune',
    prompt: 'For every order placed by a customer who lives in Pune, return the order `id` (as `order_id`), the customer `name` (as `customer_name`) and the `order_date`. Any row order is fine.',
    hints: ['orders.customer_id points at customers.id.', 'JOIN customers c ON c.id = o.customer_id, then filter on c.city.', 'Rename columns with AS: o.id AS order_id.'],
    solutionSql: "SELECT o.id AS order_id, c.name AS customer_name, o.order_date FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.city = 'Pune';",
  },
  {
    id: 'sql-04-never-ordered', dataset: 'shop', level: 'intermediate', topic: 'LEFT JOIN … IS NULL',
    title: 'Customers who never ordered',
    prompt: 'Marketing wants to e-mail customers who signed up but never placed an order. Return their `name` and `email`.',
    hints: ['An INNER JOIN drops customers without orders — you need the rows that have no match.', 'LEFT JOIN orders and keep rows where the order side IS NULL. NOT EXISTS works too.'],
    solutionSql: 'SELECT c.name, c.email FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL;',
  },
  {
    id: 'sql-05-category-revenue', dataset: 'shop', level: 'intermediate', topic: 'GROUP BY, SUM',
    title: 'Revenue per category',
    prompt: 'Compute revenue per product category as `category` and `revenue`, where revenue is the sum of quantity × unit_price over order items. Ignore cancelled and pending orders.',
    hints: ['You need order_items (money), products (category) and orders (status).', "Filter with o.status NOT IN ('cancelled', 'pending') before grouping.", 'SUM(oi.quantity * oi.unit_price) … GROUP BY p.category.'],
    solutionSql: `SELECT p.category, SUM(oi.quantity * oi.unit_price) AS revenue
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
WHERE o.status NOT IN ('cancelled', 'pending')
GROUP BY p.category;`,
  },
  {
    id: 'sql-06-big-spenders', dataset: 'shop', level: 'intermediate', topic: 'HAVING',
    title: 'Customers who paid more than ₹20,000',
    prompt: 'Using the `payments` table, find customers whose payments add up to more than 20000. Return `name` and `total_paid`, biggest spender first.',
    hints: ['payments → orders → customers.', 'Group by the customer, then filter groups with HAVING SUM(p.amount) > 20000.', 'Group by c.id, c.name so two people with the same name are not merged.'],
    solutionSql: `SELECT c.name, SUM(p.amount) AS total_paid
FROM payments p
JOIN orders o ON o.id = p.order_id
JOIN customers c ON c.id = o.customer_id
GROUP BY c.id, c.name
HAVING SUM(p.amount) > 20000
ORDER BY total_paid DESC, c.name;`,
    ordered: true,
  },
  {
    id: 'sql-07-top-earner', dataset: 'hr', level: 'intermediate', topic: 'Window functions: RANK',
    title: 'Top earner in each department',
    prompt: 'For each department, return the employee(s) with the highest salary: `department`, `employee` and `salary`. If two people tie, return both.',
    hints: ['RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) numbers employees inside each department.', 'You cannot filter a window function in WHERE — compute it in a CTE or subquery first.', 'Keep rows where the rank = 1; RANK (not ROW_NUMBER) keeps ties.'],
    solutionSql: `WITH ranked AS (
  SELECT e.*, RANK() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC) AS rnk
  FROM employees e
)
SELECT d.name AS department, r.name AS employee, r.salary
FROM ranked r JOIN departments d ON d.id = r.department_id
WHERE r.rnk = 1;`,
  },
  {
    id: 'sql-08-running-total', dataset: 'shop', level: 'advanced', topic: 'Window functions: running total',
    title: 'Daily payments with a running total',
    prompt: 'Return one row per day that has payments: `day` (a date), `daily_total` (sum of amounts that day) and `running_total` (sum of all payments up to and including that day), ordered by day.',
    hints: ['paid_at::date turns a timestamp into a date.', 'First aggregate per day (GROUP BY), then apply SUM(daily_total) OVER (ORDER BY day).', 'A window function can wrap an aggregate: SUM(SUM(amount)) OVER (ORDER BY paid_at::date).'],
    solutionSql: `SELECT paid_at::date AS day,
       SUM(amount) AS daily_total,
       SUM(SUM(amount)) OVER (ORDER BY paid_at::date) AS running_total
FROM payments
GROUP BY paid_at::date
ORDER BY day;`,
    ordered: true,
  },
  {
    id: 'sql-09-reporting-tree', dataset: 'hr', level: 'advanced', topic: 'Recursive CTE',
    title: "Meera's whole organisation",
    prompt: 'Meera Iyer is VP Engineering. Return everyone who reports to her directly or indirectly: `name`, `title` and `level` (1 = reports directly to Meera, 2 = reports to one of those, …). Do not include Meera herself.',
    hints: ['employees.manager_id is a self-reference — a tree.', 'WITH RECURSIVE org AS (anchor: direct reports of Meera, level 1 UNION ALL recursive step: employees whose manager is in org, level + 1).', "Find Meera's id with a subquery: (SELECT id FROM employees WHERE name = 'Meera Iyer')."],
    solutionSql: `WITH RECURSIVE org AS (
  SELECT id, name, title, 1 AS level
  FROM employees
  WHERE manager_id = (SELECT id FROM employees WHERE name = 'Meera Iyer')
  UNION ALL
  SELECT e.id, e.name, e.title, org.level + 1
  FROM employees e JOIN org ON e.manager_id = org.id
)
SELECT name, title, level FROM org;`,
  },
  {
    id: 'sql-10-keyset', dataset: 'audit', level: 'advanced', topic: 'Keyset pagination',
    title: 'Next page of the audit log',
    prompt: `An API pages through \`audit_logs\` in \`(created_at, id)\` order, 10 rows per page. The last row of the previous page was \`created_at = '${cursor.createdAt}'\`, \`id = ${cursor.id}\`. Return the next page: \`id\`, \`user_id\`, \`action\` and \`created_at\` — without using OFFSET.`,
    hints: ['Several rows share the same created_at, so created_at alone is not a safe cursor — id breaks ties.', `A row-value comparison does it in one condition: WHERE (created_at, id) > ('${cursor.createdAt}', ${cursor.id}).`, 'ORDER BY created_at, id LIMIT 10 — the index on (created_at, id) makes this fast at any depth.'],
    solutionSql: `SELECT id, user_id, action, created_at
FROM audit_logs
WHERE (created_at, id) > ('${cursor.createdAt}'::timestamptz, ${cursor.id})
ORDER BY created_at, id
LIMIT 10;`,
    ordered: true,
  },
];
