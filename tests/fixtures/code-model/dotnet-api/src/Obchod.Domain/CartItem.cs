namespace Obchod.Domain;

public sealed record CartItem(string Id, string Name, int Quantity, int UnitPriceCents)
{
    public int TotalCents => Quantity * UnitPriceCents;
}

public sealed record Cart(IReadOnlyList<CartItem> Items)
{
    public int TotalCents => Items.Sum(item => item.TotalCents);

    public bool IsEmpty => Items.Count == 0;
}
