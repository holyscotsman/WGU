---
title: 4.2 Stockouts and Safety Stock
objectives: 2.6
lesson: s1-l4
page: 4.2
kind: page
---
# 4.2 Stockouts and Safety Stock

### Essential Question

How is safety stock used to avoid stockouts?

In the EOQ model, it is assumed that demand is constant and known; however, in practice, this is rarely true for independent demand items. This lesson discusses ways to ensure that uncertainty about actual demand does not result in lost sales due to stockouts. The process begins by determining the point at which inventory must be replenished.

## Order Point Determination

A stockout occurs when inventory is depleted. A stockout may occur for a variety of reasons. For example, an organization may underestimate demand and experience disruptions in its supply chain or delays in production that lead to late delivery of the product. In the models thus far, it was assumed that inventory would be replenished just as the inventory level hit zero. Thus, the minimum inventory level was treated as zero. In most situations, the replenishment of inventory requires some advance notice. For example, a company that orders materials from a supplier must account for the following timing elements:

- the time it takes that order to reach the supplier's offices
- the time to fill the order
- the shipping time

This is called lead time. Failing to account for lead time can cause an organization to run out of inventory. This situation is known as a stockout. Any time a stockout occurs, a disruption in production, idle employees, and unhappy customers will likely be the result. Most companies try to avoid stockouts if possible. The easiest way to account for lead time is to use an order point. An order point, also known as the re-order point, is simply a level of inventory at which an order should be placed, accounting for lead time and safety stock so that the order will arrive before a stockout occurs. Under a perpetual inventory system, a replenishment order is always placed when inventory reaches the order point. The following figure shows how the order point is determined.

Indicates that the order point should be a level of inventory that will be sufficient to last throughout the lead time with inventory reaching zero just as the order arrives.

The graph indicates that the order point should be a level of inventory that will be sufficient to last throughout the lead time with inventory reaching zero just as the order arrives.

## Safety Stock

The order point determination works well when the demand rate and lead time are known. It is much more common to find that demand and lead time both vary. If either lead time or demand (or both) is less than expected, there will be no problem when the order arrives; some inventory will remain. But if either demand or lead time (or both) exceed expected values, then a stockout will occur because inventory will hit zero before the order arrives, as shown in the following figure.

If either lead time or demand (or both) is less than expected, there will be no problem when the order arrives; some inventory will remain. But if either demand or lead time (or both) exceed expected values, then a stockout will occur because inventory will hit zero before the order arrives, as shown in the figure.

To avoid stockouts, most companies add a safety stock (an extra amount of inventory) to the order point. This adds a buffer of inventory that can be expected to remain when an order is received. Instead of allowing inventory to be depleted before an order comes in, it only decreases the amount of safety stock, as shown in the following figure. Due to demand and lead-time variability, more or less stock may remain at any given time. The expectation is that this buffer of safety stock will be sufficient to prevent most stockouts.

Due to demand and lead-time variability, more or less stock may remain at any given time. The expectation is that this buffer of safety stock will be sufficient to prevent most stockouts.

## Service Level

No matter how much safety stock a company carries, there is always some chance that a stockout will occur due to unusually high demand or an unexpected long lead time. It is not possible for a company to avoid stockouts altogether. The trade-off is clear. If a company adds more safety stock, its inventory carrying cost will increase, but the probability of a stockout and lost sales decline. What is the right amount of safety stock to balance these two possibilities? Many companies choose to address this trade-off by selecting a level of stockouts that they are willing to accept, which is commonly called the service level.

Service level is the percentage of replenishment orders that are received before a stockout occurs. For instance, a 95% service level would indicate that 95% of all orders placed to replenish inventory are received before a stockout occurs. But in 5% of the cases, inventory will hit zero before the order is received. Inventory levels can greatly influence a company's ability to fulfill customer orders. For online retail companies, rapid delivery of customer orders can be so important that the extra cost incurred by carrying higher inventory is worthwhile. In other organizations, though, customers may not always expect the item they want to be in stock. Because service level is so important, its determination must involve not only operations but also marketing and sometimes finance. Considering the role of rapid delivery in the organization's competitive strategy and balancing this role against the added costs of carrying extra inventory can allow an organization to determine the service level that will best meet its needs. Determination of service level is a managerial decision that must be based on many factors. A company that competes for quality of service may choose a service level of 99% or higher. Another company may be in an industry where meeting customer demand from inventory is not important. For the latter, a service level of 80% or lower may be acceptable. Once the service level has been determined, a company may proceed to calculate its safety stock needed to prevent or reduce the possibility of a stockout.
