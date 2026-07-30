import { Body, Controller, Get, Param, Post } from '@nestjs/common';

export interface Widget {
  id: string;
  name: string;
  price: number;
  inStock: boolean;
  tags: string[];
}

const CATALOG: Widget[] = [
  { id: 'w-1', name: 'Left-handed sprocket', price: 12.5, inStock: true, tags: ['sprocket'] },
  { id: 'w-2', name: 'Reinforced grommet', price: 3.25, inStock: true, tags: ['grommet'] },
  { id: 'w-3', name: 'Brass flange', price: 41, inStock: false, tags: ['flange', 'brass'] },
];

/**
 * Stand-in for a real sim company's domain API. Deliberately dull — its only
 * job in the test suite is to be something chaos can break and the driver can
 * call.
 */
@Controller('widgets')
export class WidgetsController {
  private readonly orders: Array<{ id: string; widgetId: string; quantity: number }> = [];

  @Get()
  list(): { widgets: Widget[]; count: number } {
    return { widgets: CATALOG, count: CATALOG.length };
  }

  @Get(':id')
  get(@Param('id') id: string): Widget | { error: string } {
    return CATALOG.find((w) => w.id === id) ?? { error: 'not_found' };
  }

  @Post('orders')
  order(@Body() body: { widgetId?: string; quantity?: number }): {
    id: string;
    widgetId: string;
    quantity: number;
  } {
    const order = {
      id: `o-${this.orders.length + 1}`,
      widgetId: body.widgetId ?? 'w-1',
      quantity: body.quantity ?? 1,
    };
    this.orders.push(order);
    return order;
  }
}
