// Starter templates for the LLD playground page.
import type { ClassModel } from './model';

export interface LldTemplate { id: string; title: string; description: string; model: ClassModel }

const strategy: ClassModel = {
  classes: [
    { id: 'Checkout', name: 'Checkout', kind: 'class', x: 40, y: 60,
      fields: ['-IDiscountStrategy _discount'], methods: ['+Checkout(IDiscountStrategy discount)', '+decimal Total(Order order)'],
      responsibility: 'Computes the payable total for an order using a pluggable discount rule' },
    { id: 'IDiscountStrategy', name: 'IDiscountStrategy', kind: 'interface', x: 380, y: 60,
      fields: [], methods: ['decimal Calculate(Order order)'], responsibility: 'Contract for any discount rule' },
    { id: 'Pct', name: 'PercentageOffStrategy', kind: 'class', x: 220, y: 320,
      fields: ['-decimal _percent'], methods: ['+decimal Calculate(Order order)'], responsibility: 'Takes a fixed percentage (e.g. 10%) off the subtotal' },
    { id: 'Flat', name: 'FlatOffStrategy', kind: 'class', x: 540, y: 320,
      fields: ['-decimal _amount'], methods: ['+decimal Calculate(Order order)'], responsibility: 'Takes a flat amount (e.g. ₹200) off orders above a threshold' },
    { id: 'Order', name: 'Order', kind: 'record', x: 40, y: 320,
      fields: ['+decimal Subtotal', '+string CustomerId'], methods: [], responsibility: 'Immutable snapshot of what the customer is buying' },
  ],
  relations: [
    { id: 'r1', from: 'Checkout', to: 'IDiscountStrategy', kind: 'association', label: 'uses', multiplicity: '1' },
    { id: 'r2', from: 'Pct', to: 'IDiscountStrategy', kind: 'implements' },
    { id: 'r3', from: 'Flat', to: 'IDiscountStrategy', kind: 'implements' },
    { id: 'r4', from: 'IDiscountStrategy', to: 'Order', kind: 'dependency' },
  ],
  notes: 'Strategy: the varying rule (discount) sits behind an interface, so new rules are new classes, not new if/else branches in Checkout.',
};

const observer: ClassModel = {
  classes: [
    { id: 'IStockObserver', name: 'IStockObserver', kind: 'interface', x: 420, y: 40,
      fields: [], methods: ['void OnPriceChanged(string symbol, decimal price)'], responsibility: 'Anything that wants to hear about price changes' },
    { id: 'StockTicker', name: 'StockTicker', kind: 'class', x: 40, y: 40,
      fields: ['-List<IStockObserver> _observers', '-Dictionary<string, decimal> _prices'],
      methods: ['+void Subscribe(IStockObserver o)', '+void Unsubscribe(IStockObserver o)', '+void UpdatePrice(string symbol, decimal price)', '-void Notify(string symbol, decimal price)'],
      responsibility: 'Holds latest prices and notifies subscribers when one changes' },
    { id: 'PriceAlert', name: 'PriceAlert', kind: 'class', x: 280, y: 300,
      fields: ['-decimal _threshold'], methods: ['+void OnPriceChanged(string symbol, decimal price)'], responsibility: 'Sends an alert when a price crosses a threshold' },
    { id: 'Dashboard', name: 'DashboardWidget', kind: 'class', x: 600, y: 300,
      fields: [], methods: ['+void OnPriceChanged(string symbol, decimal price)'], responsibility: 'Re-renders the price tile on screen' },
  ],
  relations: [
    { id: 'r1', from: 'StockTicker', to: 'IStockObserver', kind: 'aggregation', label: 'notifies', multiplicity: '0..*' },
    { id: 'r2', from: 'PriceAlert', to: 'IStockObserver', kind: 'implements' },
    { id: 'r3', from: 'Dashboard', to: 'IStockObserver', kind: 'implements' },
  ],
  notes: 'Observer: the subject knows only the observer interface, so new listeners can be added without changing StockTicker.',
};

const parkingLot: ClassModel = {
  classes: [
    { id: 'ParkingLot', name: 'ParkingLot', kind: 'class', x: 40, y: 40,
      fields: ['-List<Level> _levels', '-IFeePolicy _fees'], methods: ['+Ticket Park(Vehicle vehicle)', '+decimal Leave(Ticket ticket)'],
      responsibility: 'Entry point: finds a spot for a vehicle and settles the fee on exit' },
    { id: 'Level', name: 'Level', kind: 'class', x: 40, y: 300,
      fields: ['-int _number', '-List<Spot> _spots'], methods: ['+Spot? FindFree(VehicleSize size)'], responsibility: 'One floor of the lot and its spots' },
    { id: 'Spot', name: 'Spot', kind: 'class', x: 340, y: 300,
      fields: ['+string Id { get; }', '+VehicleSize Size { get; }', '+bool IsFree { get; private set; }'], methods: ['+void Occupy()', '+void Release()'],
      responsibility: 'A single parking space with a size' },
    { id: 'Vehicle', name: 'Vehicle', kind: 'abstract', x: 660, y: 40,
      fields: ['+string Plate { get; }'], methods: ['+VehicleSize Size()*'], responsibility: 'Something that can park' },
    { id: 'Car', name: 'Car', kind: 'class', x: 560, y: 300, fields: [], methods: ['+VehicleSize Size()'], responsibility: 'A medium vehicle' },
    { id: 'Bike', name: 'Bike', kind: 'class', x: 780, y: 300, fields: [], methods: ['+VehicleSize Size()'], responsibility: 'A small vehicle' },
    { id: 'VehicleSize', name: 'VehicleSize', kind: 'enum', x: 660, y: 520, fields: ['Small', 'Medium', 'Large'], methods: [], responsibility: 'Spot and vehicle size classes' },
    { id: 'Ticket', name: 'Ticket', kind: 'record', x: 340, y: 40,
      fields: ['+string Id', '+string SpotId', '+DateTime EnteredAt'], methods: [], responsibility: 'Proof of entry used to compute the fee',
      states: ['Active', 'Paid', 'Lost'], transitions: [{ from: 'Active', to: 'Paid', event: 'pay' }, { from: 'Active', to: 'Lost', event: 'report lost' }, { from: 'Paid', to: '[*]' }] },
    { id: 'IFeePolicy', name: 'IFeePolicy', kind: 'interface', x: 40, y: 540, fields: [], methods: ['decimal Calculate(Ticket ticket, DateTime exitAt)'], responsibility: 'How much a stay costs' },
  ],
  relations: [
    { id: 'r1', from: 'ParkingLot', to: 'Level', kind: 'composition', multiplicity: '1..*' },
    { id: 'r2', from: 'Level', to: 'Spot', kind: 'composition', multiplicity: '1..*' },
    { id: 'r3', from: 'Car', to: 'Vehicle', kind: 'inherits' },
    { id: 'r4', from: 'Bike', to: 'Vehicle', kind: 'inherits' },
    { id: 'r5', from: 'ParkingLot', to: 'Ticket', kind: 'dependency', label: 'issues' },
    { id: 'r6', from: 'ParkingLot', to: 'IFeePolicy', kind: 'association' },
    { id: 'r7', from: 'Spot', to: 'VehicleSize', kind: 'association' },
    { id: 'r8', from: 'Vehicle', to: 'VehicleSize', kind: 'dependency' },
  ],
  notes: 'Fee rules change often (weekend rates, EV discounts), so they sit behind IFeePolicy.',
};

const library: ClassModel = {
  classes: [
    { id: 'Library', name: 'Library', kind: 'class', x: 40, y: 40, fields: ['-List<Book> _books', '-List<Member> _members'],
      methods: ['+Loan Borrow(string memberId, string isbn)', '+void Return(string loanId)'], responsibility: 'Coordinates borrowing and returning' },
    { id: 'Book', name: 'Book', kind: 'class', x: 360, y: 40, fields: ['+string Isbn { get; }', '+string Title { get; }', '-List<BookCopy> _copies'], methods: ['+BookCopy? AvailableCopy()'], responsibility: 'A title in the catalogue' },
    { id: 'BookCopy', name: 'BookCopy', kind: 'class', x: 680, y: 40, fields: ['+string Barcode { get; }'], methods: [], responsibility: 'A physical copy that can be lent',
      states: ['Available', 'OnLoan', 'Lost'], transitions: [{ from: 'Available', to: 'OnLoan', event: 'borrow' }, { from: 'OnLoan', to: 'Available', event: 'return' }, { from: 'OnLoan', to: 'Lost', event: 'mark lost' }] },
    { id: 'Member', name: 'Member', kind: 'class', x: 40, y: 320, fields: ['+string Id { get; }', '+string Name { get; }'], methods: ['+bool CanBorrow()'], responsibility: 'A person allowed to borrow (max 5 loans)' },
    { id: 'Loan', name: 'Loan', kind: 'class', x: 360, y: 320, fields: ['+DateOnly Due { get; }'], methods: ['+decimal LateFee(DateOnly today)'], responsibility: 'One copy lent to one member until a due date' },
  ],
  relations: [
    { id: 'r1', from: 'Library', to: 'Book', kind: 'aggregation', multiplicity: '0..*' },
    { id: 'r2', from: 'Library', to: 'Member', kind: 'aggregation', multiplicity: '0..*' },
    { id: 'r3', from: 'Book', to: 'BookCopy', kind: 'composition', multiplicity: '1..*' },
    { id: 'r4', from: 'Loan', to: 'BookCopy', kind: 'association', multiplicity: '1' },
    { id: 'r5', from: 'Loan', to: 'Member', kind: 'association', multiplicity: '1' },
    { id: 'r6', from: 'Library', to: 'Loan', kind: 'dependency', label: 'creates' },
  ],
  notes: '',
};

export const LLD_TEMPLATES: LldTemplate[] = [
  { id: 'blank', title: 'Blank', description: 'Start from an empty canvas', model: { classes: [], relations: [], notes: '' } },
  { id: 'strategy', title: 'Strategy pattern', description: 'Pluggable discount rules', model: strategy },
  { id: 'observer', title: 'Observer pattern', description: 'Stock ticker with subscribers', model: observer },
  { id: 'parking', title: 'Parking lot', description: 'Classic LLD interview problem', model: parkingLot },
  { id: 'library', title: 'Library', description: 'Books, copies, members and loans', model: library },
];
