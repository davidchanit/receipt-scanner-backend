import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('receipts')
export class Receipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  date: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 255 })
  vendor_name: string;

  @Column({ type: 'text' })
  receipt_items: string; // JSON string for SQLite compatibility

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  tax: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: number;

  @Column({ type: 'varchar', length: 500 })
  image_url: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Helper methods for JSON handling
  getReceiptItems(): Array<{ item_name: string; item_cost: number }> {
    try {
      return JSON.parse(this.receipt_items);
    } catch {
      return [];
    }
  }

  setReceiptItems(items: Array<{ item_name: string; item_cost: number }>): void {
    this.receipt_items = JSON.stringify(items);
  }
}
