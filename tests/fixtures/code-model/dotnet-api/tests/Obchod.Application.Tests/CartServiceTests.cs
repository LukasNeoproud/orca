using Obchod.Application;
using Obchod.Domain;
using Obchod.Infrastructure;
using Xunit;

namespace Obchod.Application.Tests;

public sealed class CartServiceTests
{
    [Fact]
    public async Task PlaceOrder_AddsTheCashOnDeliverySurcharge()
    {
        var service = new CartService(new InMemoryCartRepository());

        var order = await service.PlaceOrderAsync(PaymentMethod.CashOnDelivery, CancellationToken.None);

        Assert.Equal(55600, order.TotalCents);
    }

    [Fact]
    public async Task PlaceOrder_RejectsAnEmptyCart()
    {
        var repository = new InMemoryCartRepository();
        await repository.ClearAsync(CancellationToken.None);
        var service = new CartService(repository);

        await Assert.ThrowsAsync<EmptyCartException>(() => service.PlaceOrderAsync(PaymentMethod.Card, CancellationToken.None));
    }
}
