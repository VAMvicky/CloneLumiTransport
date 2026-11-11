package id.lumi.transport;

import static org.junit.Assert.assertEquals;

import org.json.JSONObject;
import org.junit.Test;

public class BusEtaTest {
    static JSONObject msg(String json) throws Exception { return new JSONObject(json); }

    static final String MSG = "{\"route_code\":\"9\",\"bus_body_no\":\"TJ-1\",\"trip_headsign\":\"Pluit\",\"stops\":[" +
            "{\"stop_id\":\"s1\",\"parent_stop_id\":\"p1\",\"name\":\"Cawang UKI\",\"latitude\":-6.2500,\"longitude\":106.8730,\"eta\":4}," +
            "{\"stop_id\":\"s2\",\"parent_stop_id\":\"p2\",\"name\":\"Cawang Ciliwung\",\"latitude\":-6.2440,\"longitude\":106.8650,\"eta\":7}," +
            "{\"stop_id\":\"s3\",\"parent_stop_id\":\"p3\",\"name\":\"Semanggi\",\"latitude\":-6.2200,\"longitude\":106.8150,\"eta\":15}]}";

    static BusEta.Target target(String fromName, double la, double lo, String toName) {
        BusEta.Target t = new BusEta.Target();
        t.fromName = fromName; t.fromLat = la; t.fromLon = lo; t.toName = toName;
        return t;
    }

    @Test public void etaByCoordinatesAndDirection() throws Exception {
        assertEquals(7, BusEta.minutes(msg(MSG), target("Cawang Ciliwung", -6.2441, 106.8651, "Semanggi")), 1e-9);
    }

    @Test public void oppositeDirectionIsIgnored() throws Exception {
        // halte tujuan berada SEBELUM halte naik di daftar sisa perjalanan bus
        assertEquals(-1, BusEta.minutes(msg(MSG), target("Semanggi", -6.2200, 106.8150, "Cawang UKI")), 1e-9);
    }

    @Test public void etaMapPreferredWhenStopIdKnown() throws Exception {
        JSONObject m = msg(MSG);
        m.put("eta_by_parent_stop_id", new JSONObject().put("p2", 6.5));
        BusEta.Target t = target("Cawang Ciliwung", Double.NaN, Double.NaN, null);
        t.fromId = "p2";
        assertEquals(6.5, BusEta.minutes(m, t), 1e-9);
    }

    @Test public void unknownStop() throws Exception {
        assertEquals(-1, BusEta.minutes(msg(MSG), target("Grogol", -6.16, 106.79, null)), 1e-9);
        assertEquals(-1, BusEta.minutes(msg("{\"stops\":[]}"), target("Grogol", -6.16, 106.79, null)), 1e-9);
    }

    /** v2.18.3: bus 13 km jauhnya tidak mungkin "tiba 5 menit lagi". */
    @Test public void implausiblyFastEtaIsRejected() throws Exception {
        JSONObject m = msg(MSG);
        m.put("latitude", -6.1300).put("longitude", 106.9000);           // ±13 km dari halte
        assertEquals(-1, BusEta.minutes(m, target("Cawang Ciliwung", -6.2441, 106.8651, "Semanggi")), 1e-9);
        m.put("latitude", -6.2470).put("longitude", 106.8690);           // ±500 m: 7 mnt masuk akal
        assertEquals(7, BusEta.minutes(m, target("Cawang Ciliwung", -6.2441, 106.8651, "Semanggi")), 1e-9);
    }

    @Test public void levels() {
        assertEquals(4, BusEta.level(0));
        assertEquals(3, BusEta.level(2));
        assertEquals(2, BusEta.level(4.9));
        assertEquals(1, BusEta.level(9));
        assertEquals(0, BusEta.level(12));
    }
}
