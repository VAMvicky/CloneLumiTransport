package id.lumi.transport;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.io.StringReader;
import java.util.Arrays;

import org.junit.Test;

public class CsvTest {
    @Test public void quotedNewlinesStayInOneRecord() throws Exception {
        Csv c = new Csv(new StringReader("id,name\r\n1,\"Halte \"\"A\"\"\nsisi utara\"\n\n2,B\n"));
        assertEquals(Arrays.asList("id", "name"), c.next());
        assertEquals(Arrays.asList("1", "Halte \"A\"\nsisi utara"), c.next());
        assertEquals(Arrays.asList("2", "B"), c.next());
        assertNull(c.next());
    }

    @Test public void emptyFieldsAndNoTrailingNewline() throws Exception {
        Csv c = new Csv(new StringReader("a,,c\n,,"));
        assertEquals(Arrays.asList("a", "", "c"), c.next());
        assertEquals(Arrays.asList("", "", ""), c.next());
        assertNull(c.next());
    }

    @Test public void parseLineCompat() {
        assertEquals(Arrays.asList("x", "y, z"), Csv.parseLine("x,\"y, z\""));
        assertEquals(Arrays.asList("x", "y, z"), GtfsImporter.parseCsv("x,\"y, z\""));
    }

    @Test public void largeInputCrossesBufferBoundary() throws Exception {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 5000; i++) sb.append(i).append(",\"q").append(i).append("\"\n");
        Csv c = new Csv(new StringReader(sb.toString()));
        for (int i = 0; i < 5000; i++) assertEquals(Arrays.asList(String.valueOf(i), "q" + i), c.next());
        assertNull(c.next());
    }
}
