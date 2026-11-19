using Obchod.Domain;

namespace Obchod.Application;

public sealed class EmptyCartException : Exception
{
    public EmptyCartException()
        : base("The cart is empty.") { }
}

public sealed class CartService(ICartRepository repository)
{
    public Task<Cart> GetCartAsync(CancellationToken cancellationToken) => repository.GetAsync(cancellationToken);

    public Task<Cart> RemoveItemAsync(string itemId, CancellationToken cancellationToken) =>
        repository.RemoveItemAsync(itemId, cancellationToken);

    public async Task<Order> PlaceOrderAsync(PaymentMethod paymentMethod, CancellationToken cancellationToken)
    {
        var cart = await repository.GetAsync(cancellationToken);
        if (cart.IsEmpty)
        {
            throw new EmptyCartException();
        }

        var surcharge = paymentMethod == PaymentMethod.CashOnDelivery ? 4900 : 0;
        var order = new Order(Guid.NewGuid().ToString("N"), cart.TotalCents + surcharge, paymentMethod);
        await repository.ClearAsync(cancellationToken);
        return order;
    }
}
